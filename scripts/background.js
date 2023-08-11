var config = {};
var isCarouselOn = false;
var currentTabIdx = 0;
var tabs = [];
var tabChangeTimer = 3;
var isTabSwitching = false;
var openLinksStartup = false;
var openLinkClicked = false;

const keepAlive = () => setInterval(chrome.runtime.getPlatformInfo, 20e3);
chrome.runtime.onStartup.addListener(keepAlive);
keepAlive();

init();

async function init() {
    // resetStorage()
    var storage = await loadSettings();
    var settings = storage.settings;

    if (settings?.openLinksOnStartUp) {
        timeoutAutoStart();
    }
}

function timeoutAutoStart() {
    setTimeout(async () => {
        await autoStart();
    }, 1000);
}

chrome.runtime.onMessage.addListener(async (request, sender) => {
    if (Object.hasOwn(request, "log")) {
        console.debug(request.log);
        return;
    }

    if (Object.hasOwn(request, "openLink")) {
        autoStart();
        return;
    }

    if (Object.hasOwn(request, "closeOther")) {
        closeOtherWIndows();
        return;
    }

    if (Object.hasOwn(request, "setConfig")) {
        config = request.setConfig;
        setConfig();
        return;
    }

    if (Object.hasOwn(request, "saveSettings")) {
        saveSettings(request.saveSettings);
        return;
    }

    if (Object.hasOwn(request, "openLinksStartup")) {
        setOpenLinksStartup(request.openLinksStartup);
        return;
    }

    if (Object.hasOwn(request, "carouselChkbox")) {
        carouselControl(request.carouselChkbox);
        return;
    }

    if (Object.hasOwn(request, "carouselTimer")) {
        setCarouselTimer(request.carouselTimer);
        return;
    }

    // console.debug(request);
});

chrome.storage.onChanged.addListener(storageOnChanged);
function storageOnChanged(changes) {
    var newSettings = changes["settings"].newValue;
    saveSettings(newSettings);
}

function setConfig() {
    setOpenLinksStartup(config.openLinksOnStartUp);
    setCarouselTimer(config.carouselTimer);
}

async function carouselControl(isCarousel) {
    isCarouselOn = isCarousel;
    carouselTick();
}

function setCarouselTimer(timer) {
    tabChangeTimer = timer;
}

function setOpenLinksStartup(openLinksStartup) {
    openLinksStartup = openLinksStartup;
}

function carouselTick() {
    if (isTabSwitching) {
        console.debug('cannot run... tab is currently switching..')
        return;
    }

    isTabSwitching = true;
    if (isCarouselOn) {
        setTimeout(() => {
            carouselTickResponse();
        }, tabChangeTimer * 1000);
    } else {
        isTabSwitching = false;
    }
}

async function carouselTickResponse() {
    var windows = await tabsByWindow();

    windows.forEach((w) => {
        chrome.windows.get(w.windowId, (window) => {
            var activeTab;
            chrome.tabs.query({ windowId: window.id }, function (tabs) {
                activeTab = tabs.find(
                    (x) => x.windowId == window.id && x.active == true
                );
                var windowTabs = windows.find((x) => x.windowId == window.id);

                var nextTabIdx = 0;
                if (activeTab.index < windowTabs.tabs.length - 1) {
                    nextTabIdx = activeTab.index + 1;
                }

                var nextWindowTabs = windows.find(
                    (x) => x.windowId == window.id
                ).tabs;
                var nextTab = nextWindowTabs[nextTabIdx];
                if (isCarouselOn) {
                    chrome.tabs.update(activeTab.id, {
                        highlighted: false,
                    });

                    chrome.tabs.update(nextTab.id, {
                        highlighted: true,
                    });
                }
            });
        });
    });

    isTabSwitching = false;
    carouselTick();
}

async function tabsByWindow() {
    var tabs = await chrome.tabs.query({});
    var ids = tabs.map((x) => x.windowId);
    ids = [...new Set(ids)];
    var windows = [];

    ids.forEach((v, i) => {
        windows.push({
            windowId: v,
            tabs: tabs.filter((x) => x.windowId == v),
        });
    });

    return windows;
}

async function loadSettings() {
    return await chrome.storage.local.get("settings"); //change this if using other storage
}

function saveSettings(settings) {
    if (settings?.displays.length == 0) {
        console.debug("did not saved");
        return;
    }

    //change this if using other storage
    chrome.storage.local.set({ settings: settings }, function () {
        if (chrome.runtime.lastError) {
            console.error(
                "Error setting " +
                    key +
                    " to " +
                    JSON.stringify(data) +
                    ": " +
                    chrome.runtime.lastError.message
            );
        }

        // console.debug("settings saved", settings);
    });
}

async function autoStart() {
    var storage = await loadSettings();
    var settings = storage.settings;

    if (!settings) {
        // console.debug("SETUP MODE... waiting settings to be saved!");
        // await setupMode();
        return;
    }

    openLinkStart(settings);
}

async function setupMode() {
    var response = await fetch("../config.json");
    var config = await response.json();
}

async function closeOtherWIndows() {
    openLinkClicked = false;
    var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    var windowId = tabs[0].windowId;

    var windows = await tabsByWindow();
    windows.forEach((v) => {
        if (v.windowId != windowId) {
            v.tabs.forEach((t) => {
                chrome.tabs.remove(t.id);
            });
        }
    });
}

function openLinkStart(settings) {
    var windows = generateWindows(settings);
    var output = generateWinSizePos(windows, settings);
    // console.debug('sizes', output)
    openWindows(output);
    
    openLinkClicked = true;
    carouselControl(settings.isCarousel);

    console.debug(output);
}

function generateWindows(settings) {
    var windows = [];
    var links = settings.links;
    var layout = settings.layouts.find((x) => x.selected == true);

    var windowLimit =
        layout.rows * layout.cols * settings.displays.length;
    var tabsPerWindow = Math.ceil(links.length / windowLimit);
    var windowIdx = 1;
    var tempLinks = [];
    links.forEach((v, i) => {
        i += 1;

        tempLinks.push(v);

        if (i % tabsPerWindow == 0 || i == links.length) {
            windows.push({
                windowId: `w${windowIdx}`,
                links: tempLinks,
            });
            windowIdx += 1;
            tempLinks = [];
        }
    });
    return windows;
}

function generateWinSizePos(windows, settings) {
    var layout = settings.layouts.find((x) => x.selected == true);
    var rWindows = [];
    var windowIdx = 0;
    settings.displays.forEach((v, dpIdx) => {
        var widthPctg = 2;
        var heightPctg = 1;

        var windowWidthLimit = 500;
        var windowHeightLimit = 0;
        var defaultRows = layout.rows;
        var defaultCols = layout.cols;
        var screenWidth = v.bounds.width;
        var screenHeight = v.bounds.height;
        var widthOffset = screenWidth * ( widthPctg / 100 );
        var heightOffset = screenHeight * ( heightPctg / 100 );
        // console.debug('widthOffset', widthOffset)
        // console.debug(screenWidth, screenHeight)

        var lefts = v.bounds.left;
        var tops = v.bounds.top;

        rows = defaultRows;
        cols = defaultCols;

        var windowLimitPerDp = defaultRows * defaultCols;

        windows.every((w, i) => {
            if (i >= windowLimitPerDp) {
                return false;
            }

            var width = parseInt(screenWidth / cols);
            var height = parseInt(screenHeight / rows);

            if (i % cols == 0) {
                //if 1st item in a row
                lefts = v.bounds.left;

                if (i != 0) {
                    tops += height;
                }
            }

            var modWidth = parseInt(widthOffset / cols);
            var modHeight = parseInt(heightOffset / rows);

            var window = {
                // width: (modWidth < windowWidthLimit) ? width : modWidth, //2x2
                // width: width + widthOffset,
                width: width + modWidth,
                // height: height + heightOffset,
                height: height + modHeight,
                left: lefts,
                top: tops,
                ...windows[windowIdx],
            };

            lefts += width;

            if (windowIdx < windows.length) {
                rWindows.push(window);
            }
            windowIdx += 1;
            return true;
        });
    });

    return rWindows;
}

function openWindows(windows) {
    windows.forEach((v, i) => {
        chrome.windows.create({
            top: v.top,
            left: v.left,
            width: v.width,
            height: v.height,
            focused: false,
            url: v.links,
        });
    });
}

function resetStorage() {
    chrome.storage.local.clear(function () {
        var error = chrome.runtime.lastError;
        if (error) {
            console.error(error);
        }
        // do something more
    });
}

function createNotif() {
    chrome.notifications.create({
        type: "basic",
        iconUrl: "https://cdn-icons-png.flaticon.com/512/4436/4436481.png",
        title: "Title",
        message: "Message",
    });
}
