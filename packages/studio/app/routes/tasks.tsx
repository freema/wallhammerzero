// /tasks: the work queue, read-only. One row per note in tasks/ (title, gate, priority, size,
// dependencies, its row in the Queue table), in the queue's order. The list follows the files:
// a note written by a session, or by the studio from a verdict, shows without a reload.

import { studioContext } from "../context.ts";
import { useLoaderOnTasks } from "../live.tsx";
import type { Route } from "./+types/tasks";

export function meta() {
  return [{ title: "Tasks · Wallhammer Zero studio" }];
}

export function loader({ context }: Route.LoaderArgs) {
  const { tasks } = context.get(studioContext);
  return { tasks: tasks.list() };
}

export default function TasksPage({ loaderData }: Route.ComponentProps) {
  const { tasks } = loaderData;
  useLoaderOnTasks();
  const open = tasks.filter((task) => task.open && task.number !== null).length;
  return (
    <main className="tasks-page" data-tasks={tasks.length}>
      <h1>Tasks</h1>
      <p className="sub">
        The queue in <code>tasks/</code>, read from the files: {tasks.length} {tasks.length === 1 ? "note" : "notes"}, {open} with an open gate. A session takes the first
        note whose gate is open and whose dependencies are done (<code>./dev node tools/task-queue/cli.mjs</code> says which). The studio only creates notes, from a rejected
        verdict; they are edited and deleted in the repo.
      </p>
      {tasks.length === 0 ? (
        <p className="empty">No task notes.</p>
      ) : (
        <table className="table tasks">
          <thead>
            <tr>
              <th>#</th>
              <th>Note</th>
              <th>Gate</th>
              <th>Priority</th>
              <th>Size</th>
              <th>Depends on</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <tr key={task.file} data-task={task.file} data-number={task.number ?? ""} data-open={task.open}>
                <td>{task.number === null ? <span className="badge badge-error" title="This note has no row in the Queue table: the gate fails on it">no row</span> : task.number}</td>
                <td>
                  <strong>{task.title}</strong>
                  <br />
                  <code className="sub">{task.file}</code>
                  {task.remaining ? <span className="badge badge-stale" title="A session ran out before finishing it: a REMAINING block says what is left">remaining</span> : null}
                </td>
                <td>{task.open ? <span className="badge badge-baked">{task.gate}</span> : <span className="badge badge-unbaked">{task.gate || "?"}</span>}</td>
                <td>{task.priority}</td>
                <td>{task.size}</td>
                <td>{task.dependsOn}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
