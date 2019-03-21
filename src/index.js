import "babel-polyfill";
import "./config.js"

import express from "express"
import bodyParser from "body-parser"
import cors from "cors"
import session from 'express-session'
import { showAllRoutes } from "utils/utils.js"

(async () => {
    log("homeDigit starting...")
    //web init
    const app = express();
    //CORS for development
    app.use(cors({
        origin: 'http://localhost:3000',
        credentials: true
    }))
    //enable req.body
    app.use(bodyParser.urlencoded({ limit: global.config.web.bodySizeLimit, extended: false }));
    //enable json format
    app.use(bodyParser.json({ limit: global.config.web.bodySizeLimit }));

    app.use(session({
        secret: 'homeDigit',
        saveUninitialized: true,
        resave: true,
        cookie: { maxAge: global.config.web.cookieTimeout } // timeout in ms, 30min
    }));

    showAllRoutes(app)

    app.listen(global.config.web.port, function() {
        log(`homeDigit start on ${this.address().port}`)
    })
})()
