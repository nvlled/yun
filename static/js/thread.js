
function load() {
    var itemNodes = document.querySelectorAll(".comment-item");
    var items = {};
    var queue = [];
    var navigation = {
        index: 0,
        history: []
    }
    var navbar = createNavbar();
    navbar.prevBtn.onclick = function(e) {
        e.preventDefault();
        prevItem();
    }
    navbar.nextBtn.onclick = function(e) {
        e.preventDefault();
        nextItem();
    }

    for (var i = 0;  i < itemNodes.length; i++) {
        var item = itemNodes[i];
        var itemId = item.querySelector("input[name=item-id]").value;
        var parentId = item.querySelector("input[name=parent-id]").value;
        var refNode = item.querySelector(".refs");

        refNode.textContent = "";
        var parentLink = item.querySelector(".body a.ref");
        if (parentLink) {
            parentLink.onclick = (function(currentId, id) {
                return function(e) {
                    e.preventDefault();
                    highlightItem(id);
                    addToHistory(currentId, id);
                }
            })(itemId, parentId);
        }

        items[itemId] = item;
        if (parentId && items[parentId]) {
            addReference(items[parentId], itemId);
        } else if (parentId) {
            queue.push([parentId, itemId]);
        }
    }

    for (var i = 0;  i < queue.length; i++) {
        var parentId = queue[i][0];
        var itemId = queue[i][1];
        if (items[parentId]) {
            addReference(items[parentId], itemId);
        }
    }

    itemNodes[0].classList.add("sel");

    function getParentId(item) {
        return item.querySelector("input[name=parent-id]").value;
    }
    function getItemId(item) {
        return item.querySelector("input[name=item-id]").value;
    }

    function addReference(parent, itemId) {
        var refNode = parent.querySelector(".refs");
        var a = document.createElement("a");
        a.href = "#item-" + itemId;
        a.textContent = ">>"+itemBy(itemId);
        a.classList.add("ref");
        a.onclick = function(e) {
            e.preventDefault();
            highlightItem(itemId);
            addToHistory(getItemId(parent), itemId);
        }
        if (!refNode.textContent.trim()) {
            refNode.textContent = "replies: ";
        }
        refNode.appendChild(a);
    }

    function itemBy(id) {
        var node = items[id];
        if (!node)
            return id;
        return node.querySelector("input[name=item-by]").value;
    }

    var lastRef = null;
    function highlightItem(itemId) {
        if (lastRef) {
            lastRef.classList.remove("sel");
        }
        var item = items[itemId];
        item.classList.add("sel");
        lastRef = item;
        item.scrollIntoView({behaviour: "smooth"});
    }

    function addToHistory(currentId, itemId) {
        let i = navigation.index;
        navigation.history.splice(i);
        navigation.history.push(currentId);
        navigation.history.push(itemId);
        navigation.index++;
        updateButtonVisibility();
    }
    function prevItem() {
        if (navigation.index <= 0)
            return;
        var i = --navigation.index
        var itemId = navigation.history[i];
        highlightItem(itemId);
        updateButtonVisibility();
    }
    function nextItem(itemId) {
        if (navigation.index >= navigation.history.length)
            return;
        var i = ++navigation.index
        var itemId = navigation.history[i];
        highlightItem(itemId);
        updateButtonVisibility();
    }

    function updateButtonVisibility() {
        var i = navigation.index;
        var hist = navigation.history;
        if (i > 0) {
            show(navbar.prevBtn);
        } else {
            hide(navbar.prevBtn);
        }

        if (i < hist.length - 1) {
            show(navbar.nextBtn);
        } else {
            hide(navbar.nextBtn);
        }
    }

    function createNavbar() {
        if (!document.body.scrollIntoView) {
            // If scrollIntoView is not supported
            // don't bother creating navbar.
            // Also note that I avoid a.click() since
            // I don't want to add clutter to browser history.
            return;
        }

        var html = [
            "<div id='navbar'>",
            "  <button id='prev'>←</button>",
            "  <button id='next'>→</button>",
            "</div>",
        ].join("\n");

        var container = document.createElement("div");
        document.body.appendChild(container);
        container.innerHTML = html;
        var navbarNode = container.children[0];

        var navbar = {
            prevBtn: navbarNode.querySelector("#prev"),
            nextBtn: navbarNode.querySelector("#next"),
        }

        hide(navbar.prevBtn);
        hide(navbar.nextBtn);

        return navbar;
    }

    function show(node) { node.style.visibility = ""; }
    function hide(node) { node.style.visibility = "hidden"; }
}

window.addEventListener("load", load);
