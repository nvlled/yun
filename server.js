

let lib = require("./lib");
let express = require("express");
let app = express();

app.set("view engine", "pug");
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
    //lib.job.start();

    app.listen(port, () => {
        console.log("listening at", port);
    });

})();
