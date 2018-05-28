
require("dotenv").config();
let proc = require("process");

const moment = require("moment");
const cheerio = require("cheerio");
const Database = require("better-sqlite3");
const striptags = require("striptags");

//const {join: joinPath} = require("path");
const baseURL = "https://hacker-news.firebaseio.com/v0";
Promise = require("bluebird");
const fs = Promise.promisifyAll(require("fs"));
const request = require("request-promise").defaults({
    jar: true,
});

let mkdir = async dir => {
    try {
        await fs.mkdirAsync(dir);
    } catch (e) { /*console.log(e)*/ }
}
let joinPath = (...paths) => {
    return paths.join("/");
}
let url = (...paths) => {
    let path = joinPath(baseURL, ...paths);
    if (!path.match(/\.json$/))
        path += ".json";
    return path;
}
let parseJSON = str => {
    try {
        return JSON.parse(str);
    } catch (e) {
        return null;
    };
}

let truncate = (str, len=100) => {
    if (!str)
        return "";
    if (str.length < len)
        return str;
    return str.slice(0, len-3) + "...";
}
let stripHtml = html => {
    return striptags(html).replace(/&.+?;/g, "");
}

let hopeless = (promiseArray) => Promise.all(promiseArray);
let dump = obj => console.dir(obj, {depth: null});

const cacheDir = __dirname+"/_cache";
const defaultPageSize = 15;
const enableCache = true;

let M = {
    url,

    database: {
        filename: __dirname + "/yun.db3",
        init() {
            let db = this.create();
            db.exec(`
                create table if not exists updated_items(
                    id varchar(15) primary key,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                );
            `);
        },
        create() {
            return new Database(this.filename);
        },
        prepare(sql) {
            let db = this.create();
            return db.prepare(sql);
        },
    },

    async tryLogin() {
        if (await M.isLoggedIn())
            return;
        return await M.hnLogin();
    },

    async hnLogin() {
        try {
            let resp = await request({
                method: "POST",
                uri: "https://news.ycombinator.com/login",
                form: {
                    acct: proc.env.HNUSER,
                    pw: proc.env.HNPASS,
                },
            });
            return true;
        } catch(e) {
            if (Math.floor(e.statusCode / 100) != 3) {
                console.log("failed to login:", e.message);
                return false;
            }
            return true;
        }
    },

    async isLoggedIn() {
        let resp = await request({
            method: "GET",
            uri: "https://news.ycombinator.com/user?id="+proc.env.HNUSER,
        });
        let $ = cheerio.load(resp);
        return $("form.profileform").find("input[value=update]").length > 0;
    },

    async comment(parent, text) {
        let resp = await request({
            method: "GET",
            uri: "https://news.ycombinator.com/item?id="+parent,
        });
        let $ = cheerio.load(resp);
        let $form = $("form[action=comment]");

        let gotoURL = $form.find("input[name=goto]").val();
        let hmac = $form.find("input[name=hmac]").val();
        console.log("hmac", );

        resp = await request({
            method: "POST",
            uri: "https://news.ycombinator.com/comment",
            form: {
                parent,
                text,
                hmac,
                ["goto"]: gotoURL,
            },
        });
        console.log(resp);
    },

    async profile() {
        let resp = await request({
            method: "GET",
            uri: "https://news.ycombinator.com/user?id=sudon",
        });
        console.log("profile", resp);
    },

    job: {
        timerId: null,
        sleepSeconds: 60,

        start() {
            this.running = true;
            let sleepMs = this.sleepSeconds;
            let loop = async () => {
                let resp = await request.get(url("updates"));
                let {items: itemIds, profiles} = parseJSON(resp) || {};

                console.log("batch job start", itemIds);

                M._setUpdated(...itemIds);
                M._removedExpiredUpdates();
                // TODO: delete rows that are a day old

                console.log("batch job end");
                if (this.running)
                    this.timerId = setTimeout(loop, sleepMs*1000);
            }
            this.timerId = setTimeout(loop);
        },

        stop() {
            this.running = false;
            clearTimeout(this.timerId);
        },
    },

    async _getCachedItem(id) {
        if (!enableCache)
            return null;
        try {
            let jsonStr = await fs.readFileAsync (`${cacheDir}/item/${id}.json`);
            console.log("** found cached for", id);
            return JSON.parse(jsonStr);
        } catch(e) { }
        return null;
    },

    async _removeCache(item) {
        try {
            console.log("** deleting cache", item.id);
            await fs.unlinkAsync(`${cacheDir}/item/${item.id}.json`);
        } catch(e) { /*console.log(e);*/ }
        return null;
    },

    async _cacheItem(item) {
        if (!item)
            return;
        try {
            let jsonData = JSON.stringify(item);
            await fs.writeFileAsync(`${cacheDir}/item/${item.id}.json`, jsonData);
        } catch(e) { console.log(e); }
        return null;
    },

    _isUpdated(id) {
        let st = M.database.prepare("select * from updated_items where id=@id");
        let updated = !! st.get({id});
        return updated
    },
    _setUpdated(...ids) {
        let st = M.database.prepare("insert or ignore into updated_items(id) values(@id)");
        for (let id of ids)
            st.run({id: id.toString()});
    },
    _clearUpdated(id) {
        let st = M.database.prepare("delete from updated_items where id=@id");
        st.run({id});
    },
    _removedExpiredUpdates(id) {
        let del = M.database.prepare("insert or ignore into updated_items(id) values(@id)");
        let st = M.database.prepare("select * from updated_items");
        let hoursExpire = 12;
        let n = 256;
        let rows = [];
        for (let row of st.iterate()) {
            rows.push(row);
            if (n-- <= 0)
                break;
        }
        for (let row of rows) {
            if (moment().diff(moment(row.timestamp), "hours") >= hoursExpire) {
                console.log("expired", row.id);
                del.run({id: row.id});
                M._removeCache(row);
            }
        }
    },

    async getItem(id, adopt=0, level=0, fetchCache=false) {
        let item = await M._getCachedItem(id);
        if (!item || fetchCache || M._isUpdated(id)) {
            let resp = await request.get(url("item", id));
            item = JSON.parse(resp);
            await M._cacheItem(item);
            M._clearUpdated(id);
        }
        if (!item)
            return {};

        item.kids = item.kids || [];
        item.level = level;
        if (adopt > 0) {
            item.kids = await Promise.all(
                item.kids.map(subId => M.getItem(subId, adopt-1, level+1))
            );
        }
        return item;
    },

    async getThread(id) {
        let queue = [id];
        let items = {};
        let batchSize = 150;
        while(queue.length > 0) {
            let batch = queue.splice(0, batchSize);
            let newItems = await Promise.all(
                batch.map(id => M.getItem(id))
            );
            for (let item of newItems) {
                queue = queue.concat(item.kids || []);
                let parent = items[item.parent];
                if (parent) {
                    item.parentBy = parent.by;
                    item.parentText = stripHtml(truncate(parent.text));
                }
                item.op = id;
                items[item.id] = item;
            }
        }
        return Object.values(items);
    },

    async getUser(username) {
        let resp = await request.get(url("user", username));
        return JSON.parse(resp);
    },

    async changedItems() {
        let resp = await request.get(url("updates"));
        let {items: itemIds, profiles} = parseJSON(resp) || {};
        return await hopeless(itemIds.map(id => M.getItem(id)));
    },

    async changedStories() {
        return (await M.changedItems()).filter(item => {
            return item.type == "story";
        });
    },

    async changedComments() {
        return (await M.changedItems()).filter(item => {
            return item.type == "comment";
        });
    },

    async topStories(page=0, pageSize=defaultPageSize) {
        let requestUrl = url("topstories");
        let resp = await request.get(requestUrl);
        let itemIds = parseJSON(resp) || [];
        let i = page*pageSize;
        itemIds = itemIds.slice(i, i+pageSize);
        console.log("itemIds", i, page, pageSize, itemIds);
        console.log(itemIds);
        let items = await Promise.all(itemIds.map(id => M.getItem(id)));
        return items;
    },

    async sampleComments() {
        let filename = "samples/comments.json";
        try {
            return JSON.parse(
                await fs.readFileAsync(filename, "utf8")
            );
        } catch (e) { } 

        let comments = await M.changedComments();
        await fs.writeFileAsync(filename, JSON.stringify(comments));
        return comments;
    },

    async init() {
        mkdir(cacheDir);
        mkdir(`${cacheDir}/item`);
        M.database.init();
    },
}

async function test() {
    let t = await M.getThread("17102981");
    dump(t.length);
    //dump(await M.topStories());
    //dump(await M.getItem("2921983", 2));
    //console.dir(await M.getUser("runald"));
}
//test();

module.exports = M;
