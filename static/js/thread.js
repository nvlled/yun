
function load() {
    var itemNodes = document.querySelectorAll(".comment-item");
    var items = {};

    var queue = [];
    for (var i = 0;  i < itemNodes.length; i++) {
        var item = itemNodes[i];
        var itemId = item.querySelector("input[name=item-id]").value;
        var parentId = item.querySelector("input[name=parent-id]").value;
        var refNode = item.querySelector(".refs");

        refNode.textContent = "replies: ";

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
    window.onhashchange = function() {
        var itemId = location.hash.match(/\d+$/);
        if (itemId) {
            highlightItem(itemId)();
        }
    }

    function addReference(parent, itemId) {
        var refNode = parent.querySelector(".refs");
        var a = document.createElement("a");
        a.href = "#item-" + itemId;
        a.textContent = ">>"+itemBy(itemId);
        a.classList.add("ref");
        a.onclick = highlightItem(itemId);
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
        return function() {
            if (lastRef) {
                lastRef.classList.remove("sel");
            }
            var item = items[itemId];
            item.classList.add("sel");
            lastRef = item;
        }
    }
}

window.addEventListener("load", load);
