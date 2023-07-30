$(document).ready(async function () {
    var config = {};
    var layouts = [];
    var links = [];

    $("#open-links").addClass("disabled");

    getConfig();

    $(window).blur(function () {
        saveSettings();
    });

    function getConfig() {
        $.getJSON("./../config.json", async function (json) {
            config = json;
            await setConfig(config);
            await getSettings();
        });
    }

    async function setConfig(data) {
        sendLog(data);
        chrome.runtime.sendMessage({ setConfig: data });

        layouts = data.layouts;
        links = data.links;

        await getDisplays();
        getLayouts();
        getLinks(links);
        $("#open-links-startup-switch").prop(
            "checked",
            data.openLinksOnStartUp
        );
        $("#carousel-switch").prop("checked", data.carouselStartUp);
        checkCarouseTimerDisabled();
        $("#carousel-timer").val(data.carouselTimer);
    }

    async function getSettings() {
        var storage = await loadSettings();
        var settings = storage.settings;
        $("#open-links-wrapper").show();
        $("#save-settings-wrapper").hide();

        if (!settings) {
            setupMode();
            return;
        }

        setDOMSettings(settings);
    }

    function setupMode() {
        $("#open-links-wrapper").hide();
        $("#save-settings-wrapper").show();
    }

    function setDOMSettings(settings) {
        chrome.runtime.sendMessage({ setConfig: settings });
        layouts = settings.layouts;
        var sDisplay = settings.displays;
        var sLinks = settings.links;
        var displayIds = sDisplay.map((x) => x.id);

        getLayouts();

        $("#display-checks .dp-checkbox").each(function () {
            $(this).prop("checked", false);
            if (displayIds.includes($(this).val())) {
                $(this).prop("checked", true);
            }
        });

        getLinks(sLinks);

        $("#open-links-startup-switch").prop(
            "checked",
            settings.openLinksOnStartUp
        );
        $("#carousel-switch").prop("checked", settings.isCarousel);
        $("#carousel-timer").val(settings.carouselTimer);
        checkCarouseTimerDisabled();
    }

    async function loadSettings() {
        return await chrome.storage.local.get("settings"); //change this if using other storage
    }

    async function saveSettings() {
        var settings = {
            layouts: updateLayouts(),
            displays: await getSelectedDisplays(),
            links: getLinksTxtbox(),
            isCarousel: checkCarouseChkbox(),
            carouselTimer: getCarouseTimer(),
            openLinksOnStartUp: getOpenLinksStartup(),
        };

        chrome.runtime.sendMessage({ saveSettings: settings });
    }

    function getLayouts() {
        $("#layout-radios").empty();
        layouts.forEach((v) => {
            $("#layout-radios").append(`
            <div class="form-check form-check-inline">
                <input class="form-check-input" name="layout-radio" type="radio" id="lr${v.id}" value="${v.id}">
                <label class="form-check-label" for="lr${v.id}">${v.name}</label>
                <img class="layout-img" src="${v.img}"/>
            </div>
            `);
        });

        selectedLayout = layouts.find((x) => x.selected == true);
        $("#layout-radios input[value='"+selectedLayout.id+"']").prop("checked", true);
    }

    async function getDisplays() {
        var displays = await chrome.system.display.getInfo();
        $("#display-checks").empty();
        displays.forEach((v, i) => {
            var idx = i + 1;
            $("#display-checks").append(`
            <div class="form-check">
                <input class="form-check-input dp-checkbox" type="checkbox" value="${v.id}" id="dp${idx}" checked>
                <label class="form-check-label" for="dp${idx}">
                    Display ${idx}: ${v.name} (${v.bounds.width}x${v.bounds.height})
                </label>
            </div>
            `);
        });

        $("#open-links").removeClass("disabled");
    }

    function getLinks(links) {
        $(".dynamic-input").empty();
        links.forEach((v, i) => {
            var deleteBtn = "";

            if (true) {
                deleteBtn = `<button class="btn btn-danger btn-remove-link" type="button"><i class="fa-solid fa-xmark"></i></button>`;
            }

            $(".dynamic-input").append(`
            <div class="dynamic-text mt-2 input-group">
            <span class="input-group-text dynamic-count"></span>
            <input type="text" class="link form-control" placeholder="Enter URL" value="${v}">
            ${deleteBtn}
            </div>`);
        });
        generateInputCounts();
    }

    function getLinksTxtbox() {
        var tempLinks = [];
        $(".link").each(function () {
            var linkVal = $(this).val();
            if (linkVal.trim() != "") {
                tempLinks.push(linkVal);
            }
        });
        return tempLinks;
    }

    async function getSelectedDisplays() {
        var displays = await chrome.system.display.getInfo();
        var tempDisplays = [];
        $(".dp-checkbox:checked").each(function () {
            tempDisplays.push(displays.find((x) => x.id == $(this).val()));
        });
        return tempDisplays;
    }

    function updateLayouts() {
        var layoutRadioValue = $('input[name="layout-radio"]:checked').val();
        return layouts.map( x => {
            x.selected = false;
            if(x.id == layoutRadioValue) {
                x.selected = true;
            };

            return x;
        });
    }

    $("#open-links").on("click", async () => {
        var displays = await getSelectedDisplays();
        if (displays.length != 0) {
            await saveSettings();
            chrome.runtime.sendMessage({ openLink: true });
        } else {
            toast("No display selected");
        }
    });

    $("#close-windows").on("click", async () => {
        chrome.runtime.sendMessage({ closeOther: true });
    });

    $("#save-settings").on("click", async function () {
        var displays = await getSelectedDisplays();
        if (displays.length != 0) {
            saveSettings();
            toast("Settings saved!");
        } else {
            toast("No display selected");
        }
    });

    $("#import-json").on("click", async function () {
        $("#file-import-json").click();
    });

    $("#file-import-json").on("change", function (e) {
        var file = e.target.files[0];
        var path = (window.URL || window.webkitURL).createObjectURL(file);
        readTextFile(path, async function (text) {
            var data = JSON.parse(text);
            await setConfig(data);
            // await getSettings();

            toast("Settings Changed!");
        });
        $(this).val("");
    });

    function readTextFile(file, callback) {
        var rawFile = new XMLHttpRequest();
        rawFile.overrideMimeType("application/json");
        rawFile.open("GET", file, true);
        rawFile.onreadystatechange = function () {
            if (rawFile.readyState === 4 && rawFile.status == "200") {
                callback(rawFile.responseText);
            }
        };
        rawFile.send(null);
    }

    $("#export-json").on("click", async function () {
        var json = {
            layouts: layouts,
            links: getLinksTxtbox(),
            carouselTimer: getCarouseTimer(),
            carouselStartUp: checkCarouseChkbox(),
            openLinksOnStartUp: getOpenLinksStartup(),
        };

        $("<a />", {
            download: "settings.json",
            href:
                "data:application/json," +
                encodeURIComponent(JSON.stringify(json)),
        })
            .appendTo("body")
            .click(function () {
                $(this).remove();
            })[0]
            .click();
    });

    $("#open-links-startup-switch").on("click", () => {
        chrome.runtime.sendMessage({ openLinksStartup: getOpenLinksStartup() });
    });

    $("#carousel-switch").on("click", () => {
        chrome.runtime.sendMessage({ carouselChkbox: checkCarouseChkbox() });
    });

    $("#carousel-switch").on("change", () => {
        checkCarouseTimerDisabled();
    });

    $("#carousel-timer").keyup(function () {
        chrome.runtime.sendMessage({ carouselTimer: getCarouseTimer() });
    });

    $("#btn-add-link").on("click", function () {
        $(".dynamic-input").append(`
        <div class="dynamic-text mt-2 input-group">
        <span class="input-group-text dynamic-count"></span>
        <input type="text" class="link form-control" placeholder="Enter URL">
        <button class="btn btn-danger btn-remove-link" type="button"><i class="fa-solid fa-xmark"></i></button>
        </div>`);
        generateInputCounts();
    });

    $(document).on("click", ".btn-remove-link", function () {
        $(this).closest(".dynamic-text").remove();
        generateInputCounts();
    });

    function generateInputCounts() {
        $(".dynamic-text").each(function (i) {
            $(this)
                .find(".dynamic-count")
                .text(i + 1);
        });
    }

    function getOpenLinksStartup() {
        return $("#open-links-startup-switch").is(":checked");
    }

    function checkCarouseChkbox() {
        return $("#carousel-switch").is(":checked");
    }

    function checkCarouseTimerDisabled() {
        $("#carousel-timer").prop("disabled", false);
        if (!checkCarouseChkbox()) {
            $("#carousel-timer").prop("disabled", true);
        }
    }

    function getCarouseTimer() {
        return $("#carousel-timer").val();
    }

    function sendLog(obj) {
        chrome.runtime.sendMessage({ log: obj });
    }
});
