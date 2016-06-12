(function () {
  "use strict";
  /*
   * Local variabls
   */
  var logging = false;

  var URLDUMMY = "###URL###";
  var B64STR = "ABCDEFGHIJKLMNOPQRSTUVWXYZ" +
        "abcdefghijklmnopqrstuvwxyz0123456789+/=";
  var URLTAGS = [
    {name: "img", attr: "src"}
  ];



  /*
   * Logging
   */
  function log() { if (logging) { console.log.apply(console, arguments); }}
  function error() { console.log.apply(console, arguments); }


  /*
   * helper functions
   */

  function nlForEach(nl, callback, thisArg) {
    for (var i = 0; i < nl.length; i++) {
      callback.call(thisArg, nl[i], i, nl);
    }
  }

  function escapeRegex (s) {
    return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  }

  function makePromise(number, cb, timeout) {
    if (number === 0) {
      cb();
    }
    var timeoutID = null, done = false;
    var cbWrapper = function () {
      if (!done) {
        done = true;
        if (timeoutID !== null) {
          clearTimeout(timeoutID);
        }
        cb();
      }
    };
    if (typeof timeout !== 'undefined') {
      timeoutID = setTimeout(cbWrapper, timeout);
    }
    return function () {
      number--;
      if (number === 0) {
        cbWrapper();
      }

    };
  }

  function utf8ToBytes(str) {
    var bytes = [];
    var j = 0;
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c < 128) {
        bytes[j++] = c;
      } else if (c < 0x800) {
        bytes[j++] = 192 + (c >>> 6);
        bytes[j++] = 128 + (c & 63);
      } else {
        bytes[j++] = 224 + (c >>> 12);
        bytes[j++] = 128 + (c >>> 6 & 63);
        bytes[j++] = 128 + (c & 63);
      }
    }
    return bytes;
  }

  function bytesToUtf8(bytes) {
    var c;
    var str = "";
    var n = bytes.length;
    for (var i = 0; i < n; i++) {
      var b = bytes[i];
      if (b > 223 && b < 240 && i + 2 < n) {
        c = (b - 224 << 12) + (bytes[++i] - 128 << 6) + bytes[++i] - 128;
      } else if (b > 191 && b < 224 && i + 1 < n) {
        c = (b - 192 << 6) + bytes[++i] - 128;
      } else {
        c = b;
      }
      str += String.fromCharCode(c);
    }
    return str;
  }

  function b64ToUtf8(b64) {
    if (b64 === null) {
      return "";
    }
    var bytes = [];
    var n1, n2, n3;
    var b1, b2, b3, b4;
    var i = 0;

    while (i < b64.length) {

      b1 = B64STR.indexOf(b64.charAt(i++));
      b2 = B64STR.indexOf(b64.charAt(i++));
      b3 = B64STR.indexOf(b64.charAt(i++));
      b4 = B64STR.indexOf(b64.charAt(i++));

      n1 = (b1 << 2) | (b2 >> 4);
      n2 = ((b2 & 15) << 4) | (b3 >> 2);
      n3 = ((b3 & 3) << 6) | b4;

      bytes.push(n1);
      if (b3 !== 64) {
        bytes.push(n2);
      }
      if (b4 !== 64) {
        bytes.push(n3);
      }
    }
    return bytesToUtf8(bytes);
  }

  function utf8ToB64(str) {
    if (str === null) {
      return "";
    }
    var bytes = utf8ToBytes(str);
    var b64 = "";
    var n1, n2, n3;
    var b1, b2, b3, b4;
    var i = 0;

    // charCodeAt() will always return a value that is less than 65536
    while (i < bytes.length) {
      n1 = bytes[i++];
      n2 = bytes[i++];
      n3 = bytes[i++];

      // NaN > 0 === 0 www.ecma-international.org/ecma-262/5.1/#sec-9.6
      b1 = n1 >> 2;
      b2 = ((n1 & 3) << 4) | (n2 >> 4);
      b3 = ((n2 & 15) << 2) | (n3 >> 6);
      b4 = n3 & 63;

      if (isNaN(n2)) {
        b3 = 64;
        b4 = 64;
      } else if (isNaN(n3)) {
        b4 = 64;
      }

      b64 += B64STR.charAt(b1) + B64STR.charAt(b2) +
        B64STR.charAt(b3) + B64STR.charAt(b4);
    }
    return b64;
  }

  function startsWith(str, start) {
    return str.lastIndexOf(start, 0) === 0;
  }

  function endsWith(str, end) {
    var position = str.length;
    position -= end.length;
    var lastIndex = str.indexOf(end, position);
    return lastIndex !== -1 && lastIndex === position;
  }

  function urlPath(url) {
    // returns empty string if url does not contain /
    var proto = url.indexOf("://");
    var from = proto < 0 ? 0 : proto + 3;
    var till = url.slice(from).lastIndexOf("/");
    return till < 0 ? "" : url.slice(0, from + till + 1);
  }

  function urlBase(url) {
    var proto = url.indexOf("://");
    if (proto < 0) {
      return "";
    }
    var baseEnd = url.indexOf("/", proto + 3);
    return url.slice(0, baseEnd + 1);
  }

  function implodeUrl(url) {
    var base = urlBase(url);
    url = url.slice(base.length);
    var segs = url.split('/');
    var length = segs.length;
    for (var i = 0; i < length; i++) {
      var seg = segs[i];
      if (seg === '.') {
        segs.splice(i, 1);
        i--;
      } else if (seg === '..') {
        if (i === 1 && segs[0] === '..') {
          break;
        } else if (i > 0) {
          segs.splice(i -1, 2);
          i -= 2;
        }
      }
    }
    return base + segs.join('/');
  }

  function joinPath(pre, post) {
    if (post.indexOf("://") > -1 || pre.length === 0) {
      // seems to be the complete url
      return post;
    } else {
      if (pre.charAt(pre.length - 1) === "/") {
        if (startsWith(post, "/")) {
          return pre + post.slice(1);
        } else {
          return pre + post;
        }
      } else {
        if (startsWith(post, "/")) {
          return pre + post;
        } else {
          return pre + "/" + post;
        }
      }
    }
  }

  /*
   * encode a arraybuffer to base64
   */
  function arrayBufferToBase64(data) {
    if (typeof data === "string") { return ""; }
    var binary = '';
    var bytes = new Uint8Array(data);

    for (var i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  function ajaxGetText(url, callback) {
    var oReq = new XMLHttpRequest();

    function reqListener () {
      callback(oReq.responseText);
    }

    oReq.onload = reqListener;
    oReq.open("get", url, true);
    oReq.send(null);
    oReq.onerror = function () {
      error("unable to get " + url);
      callback("");
    };
  }

  function ajaxGetBase64(url, callback) {
    var oReq = new XMLHttpRequest();

    function reqListener () {
      var dataType = oReq.getResponseHeader("Content-Type");
      callback("data:" + dataType + ";charset=utf-8;base64," + arrayBufferToBase64(oReq.response));
    }

    // Check if still required => overriding "works" in FF but not in Chrome
    //        oReq.overrideMimeType("text/plain;charset=x-user-defined");
    oReq.onload = reqListener;
    oReq.open("get", url, true);
    oReq.responseType = 'arraybuffer';
    oReq.send(null);
    oReq.onerror = function () {
      error("unable to get " + url);
      callback("");
    };
  }

  function downloadBunchOfFilesText(files, callback) {
    downloadBunchOfFiles(files, callback, false);
  }

  function downloadBunchOfFilesBase64(files, callback) {
    downloadBunchOfFiles(files, callback, true);
  }

  function downloadBunchOfFiles(files, callback, base64) {
    var ajaxGet = base64 ? ajaxGetBase64 : ajaxGetText;
    var numberFiles = files.length;
    var fileContents = {};
    var doCallback = makePromise(numberFiles, function () {
      callback(fileContents);} );

    function addData(url) {
      return function (data) {
        fileContents[url] = data;
        doCallback();
      };
    }
    files.forEach(function (url) {
      if (url in fileContents) {
        doCallback();
      } else {
        fileContents[url] = "";
        ajaxGet(url, addData(url));
      }
    });
  }


  /*
   * css/script/url inlining functions
   */
  function inlineAllCSS(node, callback) {

    function removeCSSTags() {
      var links = node.getElementsByTagName("link");
      var styleSheets = [];
      nlForEach(links, function (link) {
        if (link.type === "text/css") {
          styleSheets.push(link);
        }
      });
      styleSheets.forEach(function(sS) {
        sS.parentNode.removeChild(sS);
      });
    }

    function extractURLs(sheets) {
      return sheets.map(function (sheet) {
        var urls = {};
        var urlRegex = /(?:.*): url\("?(?!data:)([\w.,@?^=%&amp;:\/~+#-]*)"?\)(?:.*)/g;
        function markAndStore(match, p1) {
          var url = joinPath(urlPath(sheet.url), p1);
          urls[url] = true;
          return match.replace(p1, URLDUMMY + url + URLDUMMY);
        }
        var dummyText = sheet.text.replace(urlRegex, markAndStore);
        return {text: dummyText, urls: Object.keys(urls)};
      });
    }

    function getStyleTexts(callback) {
      var styleTexts = [];
      var toDownload = [];
      nlForEach(document.styleSheets, function (sheet) {
        if ("href" in sheet && sheet.href !== "") {
          styleTexts.push({url: sheet.href, text: ""});
          toDownload.push(sheet.href);
        } else {
          styleTexts.push({url: "", text: sheet.ownerNode.textContent});
        }
      });
      downloadBunchOfFilesText(toDownload, function (fileData) {
        styleTexts.forEach(function (styleText) {
          if (styleText.url !== "") {
            styleText.text = fileData[styleText.url];
          }
        });
        callback(styleTexts);
      });
    }

    function downloadStyleURLs(sheets, callback) {
      var urls = {};
      sheets.forEach(function (sheet) {
        sheet.urls.forEach(function (url) {
          urls[url] = true;
        });
      });
      downloadBunchOfFilesBase64(Object.keys(urls), function (data) {
        callback(sheets, data);
      });
    }

    function replaceURLsWithBase64(sheets, fileData) {
      sheets.forEach(function (sheet) {
        sheet.urls.forEach(function (url) {
          var dummyURL = URLDUMMY + url + URLDUMMY;
          var urlRegex = new RegExp(escapeRegex(dummyURL), 'g');
          sheet.text =  sheet.text.replace(urlRegex, fileData[url]);
        });
      });
    }

    function createInlineStyles(sheets) {
      sheets.forEach(function (sheet) {
        var style = document.createElement("style");
        style.type = "text/css";
        style.textContent = sheet.text;
        node.getElementsByTagName("head")[0].appendChild(style);
      });
    }

    function inlineURLs(sheets) {
      sheets = extractURLs(sheets);
      downloadStyleURLs(sheets, function (sheets, fileData) {
        replaceURLsWithBase64(sheets, fileData);
        createInlineStyles(sheets);
        callback();
      });
    }

    var scripts = node.getElementsByTagName("script");
    nlForEach(scripts, function(sS) {
      sS.parentNode.removeChild(sS);
    });
    removeCSSTags();
    getStyleTexts(inlineURLs);
  }


  var pageGatherer = {
    gatherPage: function (callback) {
      var self = this;
      self.hash = document.location.hash;
      var tasks = 1;
      var gatherPageCB = makePromise(tasks, function () {
        callback(clone.outerHTML);
      });
      var clone = document.querySelector("html").cloneNode(true);
      clone.setAttribute("mode", "offline");
      inlineAllCSS(clone, gatherPageCB);
      return clone;
    }
  };

  function downloadBlob(a, parentNode) {
    a.style.display = "none";
    parentNode.appendChild(a);
    a.click();
    parentNode.removeChild(a);
  }


  function downloadData(data, fileType, fileName, parentNode) {
    parentNode = typeof parentNode !== 'undefined' ? parentNode : document.body;
    var blob = new Blob([data], { type: fileType });
    var downloadUrl = window.URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.download = fileName;
    a.href = downloadUrl;
    downloadBlob(a, parentNode);
  }


  /*
   * exports
   */
  function pagedownload() {
    pageGatherer.gatherPage(function (data) {
      downloadData(data, "text/plain", "down.html");
    });
  };

  pagedownload();

})();
