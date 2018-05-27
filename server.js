
require("dotenv").config();
const proc = require("process");
const moment = require("moment");

const lib = require("./lib");
const express = require("express");
const session = require("express-session");
const app = express();

app.set('trust proxy', 1) // trust first proxy
app.set("view engine", "pug");

app.use((req, res, next) => {
    res.locals.hnuser = proc.env.HNUSER;
    res.locals.moment = moment;
    next();
});
app.use(session({
      secret: proc.env.SESSION_KEY,
      resave: false,
      saveUninitialized: true,
      cookie: { secure: true }
}))

app.get("/", async (req, res) => {
    let page = parseInt(req.query.page) || 0;
    res.render("home", {
        items: await lib.topStories(page),
        page,
    });
});

app.get("/s/:id", async (req, res) => {
    let id = req.params.id;
    let items = await lib.getThread(id);
    res.render("thread", {
        title: (items[0] || {}).title,
        items,
    });
});

app.use("/static", express.static(__dirname+"/static"));

const port = 4000;
(async function() {
    await lib.init();
    lib.job.start();

    app.listen(port, () => {
        console.log("listening at", port);
    });

})();

