
const path = require('path');
const express = require('express');

console.log("Starting test_mount.js");

try {
    console.log("Requiring ./APIs/game.js");
    const mod = require('./APIs/game.js');
    console.log("Require successful. Type:", typeof mod);
    console.log("Keys:", Object.keys(mod));

    if (mod instanceof express.Router) {
        console.log("It IS an express.Router");
    } else {
        console.log("It is NOT an express.Router");
    }

} catch (e) {
    console.error("Require FAILED:", e);
}

try {
    console.log("Requiring ./APIs/chat.js");
    const mod = require('./APIs/chat.js');
    console.log("Require successful. Type:", typeof mod);
} catch (e) {
    console.error("Require FAILED:", e);
}
