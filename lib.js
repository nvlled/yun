

//const {join: joinPath} = require("path");
const baseURL = "https://hacker-news.firebaseio.com/v0";
const request = require("request-promise");
Promise = require("bluebird");
const fs = Promise.promisifyAll(require("fs"));

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
let hopeless = (promiseArray) => Promise.all(promiseArray);
let dump = obj => console.dir(obj, {depth: null});

const cacheDir = __dirname+"/_cache";
const defaultPageSize = 15;
const enableCache = false;

let M = {
    url,

    job: {
        intervalId: null,

        lastItemIds: {},

        start() {
            this.running = true;
            let loop = async () => {
                let resp = await request.get(url("updates"));
                let {items: itemIds, profiles} = parseJSON(resp) || {};

                let changed = false;
                for (let id of itemIds) {
                    if (!this.lastItemIds[id]) {
                        changed = true;
                        break;
                    }
                }
                if ( ! changed) {
                    if (this.running)
                        this.intervalId = setTimeout(loop, 60*1000);
                    return;
                }

                console.log("batch job start", itemIds);

                this.lastItemIds = {};
                let ps = []
                for (let id of itemIds) {
                    console.log("updating", id);
                    ps.push(M.getItem(id, 0, 0, false));
                    if (!this.running)
                        break;
                    this.lastItemIds[id] = true;
                }
                await Promise.all(ps);
                console.log("batch job end");
                if (this.running)
                    this.intervalId = setTimeout(loop, 60*1000);
            }
            this.intervalId = setTimeout(loop);
        },

        stop() {
            this.running = false;
            clearTimeout(this.intervalId);
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

    async _cacheItem(item) {
        try {
            let jsonData = JSON.stringify(item);
            console.log("** caching", item.id);
            await fs.writeFileAsync(`${cacheDir}/item/${item.id}.json`, jsonData);
        } catch(e) { console.log(e); }
        return null;
    },

    async getItem(id, adopt=0, level=0, fetchCache=false) {
        let item = await M._getCachedItem(id);
        if (!item || fetchCache) {
            let resp = await request.get(url("item", id));
            item = JSON.parse(resp);
            M._cacheItem(item);
        }

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
        let items = [];
        let batchSize = 150;
        while(queue.length > 0) {
            let batch = queue.splice(0, batchSize);
            let newItems = await Promise.all(
                batch.map(id => M.getItem(id))
            );
            for (let item of newItems) {
                queue = queue.concat(item.kids || []);
                items.push(item);
            }
        }
        return items;
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
