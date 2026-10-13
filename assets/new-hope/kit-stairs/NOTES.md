# new-hope/kit-stairs

- **Reads at 4x:** A landing and three steps of three voxels climbing toward `dir`, concrete under steel treads with yellow ends. The fourth rise is the floor slab of the cell beyond `dir` one level up (top at local 13). In the facings that look up the flight (sw, se for `-z`) it reads as stairs; from behind it is a stepped wall.
- **Reads at 1x:** A stepped block with yellow dots.
- **Passes:** 2. Pass 1 jittered the whole body: noise on a 16 px piece. Pass 2 jitters only the landing slab.
- **Open issues:** A one-cell flight is steep (3 voxels up per voxel forward); that is what a storey of 12 in a cell of 4 allows.
- **Rough time:** ~10 min.
