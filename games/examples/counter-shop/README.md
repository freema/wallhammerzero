# counter-shop

The example game: the smallest game that uses real engine systems. Customers arrive and queue
(`shop.arrivals`); the first in line buys one item if it is in stock and within budget
(`shop.counter`). It has no scenes, UI or sound yet: those come with the runtime notes. It is
not the first real game.

```sh
./dev npm run game -- validate counter-shop
./dev npm run game -- pack counter-shop
```

The tables in `data/` are the data of the sim's golden replay
(`packages/sim/golden/counter-shop.data.json` is the sim's own copy; a test of
`packages/game-data` keeps the two equal). Changing a value or the order of rows here changes
the `simDataHash`, so the golden replay has to be recorded again in the same commit. Changing
a text in `locales/` does not.

The layout and the rules are in [docs/game-data.md](../../../docs/game-data.md).
