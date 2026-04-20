const express = require("express");

const gameRouter = require("../../APIs/game");
const chatRouter = require("../../APIs/chat");

const rummyRouter = express.Router();

// Keep all rummy HTTP APIs inside one game namespace.
rummyRouter.use("/", gameRouter);
rummyRouter.use("/", chatRouter);

module.exports = rummyRouter;
