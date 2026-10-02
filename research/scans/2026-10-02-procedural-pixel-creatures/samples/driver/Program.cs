// Analysis driver for the Wallhammer Zero review of procedural-pixel-creatures. Our own code, kept
// for reproducibility only: it calls the third-party Core API and is not part of any WZ package.
// Renders uncurated samples, animation strips, facings, a small-size test and numeric stats.
// Runs in Docker with --network none; writes only to the output directory given as argv[0].

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using PixelCreatures.Core;
using PixelCreatures.Core.Export;
using PixelCreatures.Core.Genetics;
using PixelCreatures.Core.Palettes;

public sealed record Sprite(byte[] Rgba, int W, int H, string Label);

public static class Program
{
    static CreatureRegistry Reg = null!;
    static CreatureFactory Fac = null!;
    static readonly Rgba Bg = new Rgba(206, 208, 196);
    static readonly Rgba Gutter = new Rgba(150, 152, 142);
    static readonly Rgba Ink = new Rgba(40, 40, 48);

    public static int Main(string[] args)
    {
        string outDir = args.Length > 0 ? args[0] : "/out";
        Directory.CreateDirectory(outDir);
        Reg = CreatureRegistry.CreateDefault();
        Reg.DiscoverExtensions(typeof(Program).Assembly);
        Fac = new CreatureFactory(Reg);
        var log = new StringBuilder();
        var seeds = GenomeFactory.UncuratedSeeds;
        log.AppendLine("families: " + string.Join(", ", Reg.Families.Select(f => f.Id)));
        log.AppendLine("uncurated seeds: " + string.Join(", ", seeds));
        log.AppendLine("family\tseed\ttraits\tframeWxH\tbboxWxH\tcoloursInFrame\tpaletteSize\twalkFrames\trepairs\twarnings\tdeterministic");

        // 1. overview: every family x the 8 uncurated seeds, idle frame 0, facing SE (dir 7)
        var overview = new List<Sprite>();
        var byFamily = new Dictionary<string, List<Sprite>>();
        foreach (var fam in Reg.Families)
        {
            byFamily[fam.Id] = new List<Sprite>();
            foreach (ulong s in seeds)
            {
                var g = GenomeFactory.Sample(fam, s);
                var m = Fac.Build(g);
                var clips = Export(m, new[] { ClipKind.Idle, ClipKind.Walk }, new[] { 7 });
                var idle0 = clips[0][0];
                var sp = idle0 with { Label = $"{fam.Id.Substring(0, Math.Min(5, fam.Id.Length))} {s}" };
                overview.Add(sp);
                byFamily[fam.Id].Add(sp);
                // determinism: rebuild with a fresh factory and compare the bytes
                var m2 = new CreatureFactory(Reg).Build(GenomeFactory.Sample(fam, s));
                var again = Export(m2, new[] { ClipKind.Idle, ClipKind.Walk }, new[] { 7 });
                bool same = Same(clips, again);
                Bbox(idle0, out int bw, out int bh);
                int colours = Colours(idle0);
                log.AppendLine($"{fam.Id}\t{s}\t{string.Join("|", m.Anatomy.Traits.Take(4))}\t{idle0.W}x{idle0.H}\t{bw}x{bh}\t{colours}\t{m.Palette.Colors.Count}\t{clips[1].Count}\t{m.Anatomy.Repairs.Count}\t{m.Warnings.Count}\t{same}");
            }
        }
        Save(outDir, "overview-72", Sheet(overview, 8, true), 2);
        foreach (var id in new[] { "biped", "quadruped", "amorphous", "winged" })
            if (byFamily.ContainsKey(id)) Save(outDir, "family-" + id, Sheet(byFamily[id], 4, true), 3);

        // 2. walk and idle strips (every frame) for a few creatures
        var strips = new List<List<Sprite>>();
        foreach (var (fid, s) in new[] { ("biped", 101UL), ("quadruped", 202UL), ("amorphous", 303UL) })
        {
            var m = Fac.Build(GenomeFactory.Sample(Reg.GetFamily(fid), s));
            var clips = Export(m, new[] { ClipKind.Idle, ClipKind.Walk }, new[] { 7 });
            foreach (var (name, frames) in new[] { ("idle", clips[0]), ("walk", clips[1]) })
            {
                var diffs = new List<int>();
                var bottoms = new List<int>();
                for (int i = 0; i < frames.Count; i++)
                {
                    diffs.Add(Diff(frames[i], frames[(i + 1) % frames.Count]));
                    bottoms.Add(Bottom(frames[i]));
                }
                log.AppendLine($"anim {fid} {s} {name}: frames={frames.Count} changedPixelsToNext=[{string.Join(",", diffs)}] (last is loop seam) baselineY=[{string.Join(",", bottoms.Distinct())}]");
            }
            strips.Add(clips[1].Select((f, i) => f with { Label = $"walk {i}" }).ToList());
            strips.Add(clips[0].Where((f, i) => i % 3 == 0).Select((f, i) => f with { Label = $"idle {i * 3}" }).ToList());
            log.AppendLine($"strip {fid} {s}: walk {clips[1].Count} frames, idle {clips[0].Count} frames");
        }
        Save(outDir, "strips-walk-idle", Rows(strips), 3);

        // 3. eight facings (rotating the 3D model, no mirroring)
        var facings = new List<List<Sprite>>();
        foreach (var (fid, s) in new[] { ("biped", 101UL), ("quadruped", 202UL) })
        {
            var m = Fac.Build(GenomeFactory.Sample(Reg.GetFamily(fid), s));
            var row = new List<Sprite>();
            for (int d = 0; d < 8; d++)
            {
                var c = Export(m, new[] { ClipKind.Idle }, new[] { d });
                row.Add(c[0][0] with { Label = PixelCamera.DirectionNames[d] });
            }
            facings.Add(row);
        }
        Save(outDir, "facings-8dir", Rows(facings), 3);

        // 4. small size test: the smallest legal size, and a 'chibi push' (big head, short legs)
        var small = new List<Sprite>();
        foreach (var fid in new[] { "biped", "quadruped", "amorphous", "winged" })
        {
            var fam = Reg.GetFamily(fid);
            foreach (ulong s in new ulong[] { 101, 202, 303 })
            {
                var g = GenomeFactory.Sample(fam, s).With("size", 0.0);
                if (fid == "biped") g = g.With("head.size", 1.0).With("legs.length", 0.0).With("head.eyeSize", 1.0);
                var m = Fac.Build(g);
                var c = Export(m, new[] { ClipKind.Idle }, new[] { 7 });
                var f = c[0][0];
                Bbox(f, out int bw, out int bh);
                small.Add(f with { Label = $"{fid.Substring(0, 5)} {bw}x{bh}" });
                log.AppendLine($"small {fid} {s}: frame {f.W}x{f.H}, content {bw}x{bh}, colours {Colours(f)}");
            }
        }
        Save(outDir, "small-size", Sheet(small, 6, true), 1);
        Save(outDir, "small-size", Sheet(small, 6, true), 5);

        File.WriteAllText(Path.Combine(outDir, "stats.tsv"), log.ToString());
        Console.WriteLine(log.ToString());
        return 0;
    }

    static List<List<Sprite>> Export(CreatureModel m, ClipKind[] kinds, int[] dirs)
    {
        var opt = new SpritesheetOptions { Clips = kinds.ToList(), Directions = dirs.ToList(), Fps = 12, Padding = 1, DrawShadow = true };
        var r = SpritesheetExporter.Export(m, Reg, opt, "x");
        var outClips = new List<List<Sprite>>();
        int rowsPerPage = Math.Max(1, opt.MaxPageSize / r.FrameHeight);
        for (int ci = 0; ci < r.Clips.Count; ci++)
        {
            var clip = r.Clips[ci];
            var list = new List<Sprite>();
            foreach (var f in clip.Frames)
            {
                var (page, pw, ph) = r.Pages[f.Page];
                var buf = new byte[r.FrameWidth * r.FrameHeight * 4];
                for (int y = 0; y < r.FrameHeight; y++)
                    Array.Copy(page, ((f.Y + y) * pw + f.X) * 4, buf, y * r.FrameWidth * 4, r.FrameWidth * 4);
                list.Add(new Sprite(buf, r.FrameWidth, r.FrameHeight, clip.Name));
            }
            outClips.Add(list);
        }
        return outClips;
    }

    static bool Same(List<List<Sprite>> a, List<List<Sprite>> b)
    {
        if (a.Count != b.Count) return false;
        for (int i = 0; i < a.Count; i++)
        {
            if (a[i].Count != b[i].Count) return false;
            for (int j = 0; j < a[i].Count; j++)
                if (!a[i][j].Rgba.AsSpan().SequenceEqual(b[i][j].Rgba)) return false;
        }
        return true;
    }

    static void Bbox(Sprite s, out int w, out int h)
    {
        int x0 = s.W, y0 = s.H, x1 = -1, y1 = -1;
        for (int y = 0; y < s.H; y++)
            for (int x = 0; x < s.W; x++)
            {
                int a = s.Rgba[(y * s.W + x) * 4 + 3];
                if (a < 200) continue; // ignore the translucent ground shadow
                if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
            }
        w = x1 >= x0 ? x1 - x0 + 1 : 0;
        h = y1 >= y0 ? y1 - y0 + 1 : 0;
    }

    static int Diff(Sprite a, Sprite b)
    {
        int n = 0;
        for (int i = 0; i < a.W * a.H; i++)
        {
            int o = i * 4;
            if (a.Rgba[o] != b.Rgba[o] || a.Rgba[o + 1] != b.Rgba[o + 1] || a.Rgba[o + 2] != b.Rgba[o + 2] || a.Rgba[o + 3] != b.Rgba[o + 3]) n++;
        }
        return n;
    }

    static int Bottom(Sprite s)
    {
        for (int y = s.H - 1; y >= 0; y--)
            for (int x = 0; x < s.W; x++)
                if (s.Rgba[(y * s.W + x) * 4 + 3] >= 200) return y;
        return -1;
    }

    static int Colours(Sprite s)
    {
        var set = new HashSet<uint>();
        for (int i = 0; i < s.W * s.H; i++)
        {
            int o = i * 4;
            if (s.Rgba[o + 3] < 200) continue;
            set.Add((uint)(s.Rgba[o] | s.Rgba[o + 1] << 8 | s.Rgba[o + 2] << 16));
        }
        return set.Count;
    }

    static (byte[] rgba, int w, int h) Sheet(List<Sprite> cells, int cols, bool labels)
    {
        int cw = cells.Max(c => c.W), ch = cells.Max(c => c.H) + (labels ? 7 : 0);
        int rows = (cells.Count + cols - 1) / cols;
        int W = cols * (cw + 1) + 1, H = rows * (ch + 1) + 1;
        var canvas = new ImageCanvas(W, H, Gutter);
        for (int i = 0; i < cells.Count; i++)
        {
            int cx = 1 + (i % cols) * (cw + 1), cy = 1 + (i / cols) * (ch + 1);
            canvas.Fill(cx, cy, cw, ch, Bg);
            var c = cells[i];
            if (labels) canvas.Text(cx + 1, cy + 1, c.Label.ToUpperInvariant(), Ink);
            int dx = cx + (cw - c.W) / 2, dy = cy + (labels ? 7 : 0) + (ch - (labels ? 7 : 0) - c.H);
            canvas.Blit(c.Rgba, c.W, c.H, dx, dy);
        }
        return (canvas.Rgba, W, H);
    }

    static (byte[] rgba, int w, int h) Rows(List<List<Sprite>> rows)
    {
        int cols = rows.Max(r => r.Count);
        var flat = new List<Sprite>();
        int cw = rows.SelectMany(r => r).Max(c => c.W), chh = rows.SelectMany(r => r).Max(c => c.H);
        foreach (var r in rows)
            for (int i = 0; i < cols; i++)
                flat.Add(i < r.Count ? r[i] : new Sprite(new byte[cw * chh * 4], cw, chh, ""));
        return Sheet(flat, cols, true);
    }

    static void Save(string dir, string name, (byte[] rgba, int w, int h) img, int scale)
    {
        var up = PngEncoder.Upscale(img.rgba, img.w, img.h, scale);
        File.WriteAllBytes(Path.Combine(dir, $"{name}-{scale}x.png"), PngEncoder.Encode(up, img.w * scale, img.h * scale));
        Console.WriteLine($"wrote {name}-{scale}x.png {img.w * scale}x{img.h * scale}");
    }
}
