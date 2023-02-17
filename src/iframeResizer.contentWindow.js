/*
 * File: iframeResizer.contentWindow.js
 * Desc: Include this file in any page being loaded into an iframe
 *       to force the iframe to resize to the content size.
 * Requires: iframeResizer.js on host page.
 * Doc: https://github.com/davidjbradshaw/iframe-resizer
 * Author: David J. Bradshaw - dave@bradshaw.net
 *
 */

//no-shadow-restricted-names
(function (undefined) {
  if (typeof window === 'undefined') return; // don't run for server side render

  let autoResize = true;
  const base = 10;
  let bodyBackground = '';
  let bodyMargin = 0;
  let bodyMarginStr = '';
  let bodyObserver = null;
  let bodyPadding = '';
  let calculateWidth = false;
  const doubleEventList = { resize: 1, click: 1 };
  const eventCancelTimer = 128;
  let firstRun = true;
  let height = 1;
  const heightCalcModeDefault = 'bodyOffset';
  let heightCalcMode = heightCalcModeDefault;
  let initLock = true;
  let initMsg = '';
  let inPageLinks = {};
  let interval = 32;
  let intervalTimer = null;
  let logging = false;
  let mouseEvents = false;
  const msgID = '[iFrameSizer]'; // Must match host page msg ID
  const msgIdLen = msgID.length;
  let myID = '';
  const resetRequiredMethods = {
    max: 1,
    min: 1,
    bodyScroll: 1,
    documentElementScroll: 1,
  };
  let resizeFrom = 'child';
  const sendPermit = true;
  let target = window.parent;
  let targetOriginDefault = '*';
  let tolerance = 0;
  let triggerLocked = false;
  let triggerLockedTimer = null;
  let throttledTimer = 16;
  let width = 1;
  const widthCalcModeDefault = 'scroll';
  let widthCalcMode = widthCalcModeDefault;
  let win = window;

  let onMessage = function () {
    warn('onMessage function not defined');
  };

  let onReady = function () {};

  let onPageInfo = function () {};

  const customCalcMethods = {
    height: function () {
      warn('Custom height calculation function not defined');

      return document.documentElement.offsetHeight;
    },
    width: function () {
      warn('Custom width calculation function not defined');

      return document.body.scrollWidth;
    },
  };
  const eventHandlersByName = {};
  let passiveSupported = false;

  function noop () {}

  try {
    const options = Object.create(
      {},
      {
        passive: {
          get: function () { // eslint-disable-line getter-return
            passiveSupported = true;
          },
        },
      }
    );
    window.addEventListener('test', noop, options);
    window.removeEventListener('test', noop, options);
  } catch (error) {
    /* */
  }

  function addEventListener (el, evt, func, options) {
    el.addEventListener(evt, func, passiveSupported ? options || {} : false);
  }

  function removeEventListener (el, evt, func) {
    el.removeEventListener(evt, func, false);
  }

  function capitalizeFirstLetter (string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
  }

  // Based on underscore.js
  function throttle (func) {
    let context;
    let args;
    let result;
    let timeout = null;
    let previous = 0;

    const later = function () {
      previous = Date.now();
      timeout = null;
      result = func.apply(context, args);

      if (!timeout) {
        // eslint-disable-next-line no-multi-assign
        context = args = null;
      }
    };

    return function () {
      const now = Date.now();

      if (!previous) {
        previous = now;
      }

      const remaining = throttledTimer - (now - previous);

      context = this;
      args = arguments;

      if (remaining <= 0 || remaining > throttledTimer) {
        if (timeout) {
          clearTimeout(timeout);
          timeout = null;
        }

        previous = now;
        result = func.apply(context, args);

        if (!timeout) {
          // eslint-disable-next-line no-multi-assign
          context = args = null;
        }
      } else if (!timeout) {
        timeout = setTimeout(later, remaining);
      }

      return result;
    };
  }

  function formatLogMsg (msg) {
    return msgID + '[' + myID + '] ' + msg;
  }

  function log (msg) {
    if (logging && typeof window.console === 'object') {
      // eslint-disable-next-line no-console
      console.log(formatLogMsg(msg));
    }
  }

  function warn (msg) {
    if (typeof window.console === 'object') {
      // eslint-disable-next-line no-console
      console.warn(formatLogMsg(msg));
    }
  }

  function init () {
    readDataFromParent();
    log('Initialising iFrame (' + window.location.href + ')');
    readDataFromPage();
    setMargin();
    setBodyStyle('background', bodyBackground);
    setBodyStyle('padding', bodyPadding);
    injectClearFixIntoBodyElement();
    checkHeightMode();
    checkWidthMode();
    stopInfiniteResizingOfIFrame();
    setupPublicMethods();
    setupMouseEvents();
    startEventListeners();
    inPageLinks = setupInPageLinks();
    sendSize('init', 'Init message from host page');
    onReady();
  }

  function readDataFromParent () {
    function strBool (str) {
      return str === 'true';
    }

    const data = initMsg.slice(msgIdLen).split(':');

    myID = data[0];
    // For V1 compatibility
    bodyMargin = undefined === data[1] ? bodyMargin : Number(data[1]);

    calculateWidth = undefined === data[2] ? calculateWidth : strBool(data[2]);
    logging = undefined === data[3] ? logging : strBool(data[3]);
    interval = undefined === data[4] ? interval : Number(data[4]);
    autoResize = undefined === data[6] ? autoResize : strBool(data[6]);
    bodyMarginStr = data[7];
    heightCalcMode = undefined === data[8] ? heightCalcMode : data[8];
    bodyBackground = data[9];
    bodyPadding = data[10];
    tolerance = undefined === data[11] ? tolerance : Number(data[11]);
    inPageLinks.enable = undefined === data[12] ? false : strBool(data[12]);
    resizeFrom = undefined === data[13] ? resizeFrom : data[13];
    widthCalcMode = undefined === data[14] ? widthCalcMode : data[14];
    mouseEvents = undefined === data[15] ? mouseEvents : Boolean(data[15]);
  }

  function depricate (key) {
    const splitName = key.split('Callback');

    if (splitName.length === 2) {
      const name =
        'on' + splitName[0].charAt(0).toUpperCase() + splitName[0].slice(1);
      this[name] = this[key];
      delete this[key];
      warn(
        "Deprecated: '" +
          key +
          "' has been renamed '" +
          name +
          "'. The old method will be removed in the next major version."
      );
    }
  }

  function readDataFromPage () {
    function readData () {
      const data = window.iFrameResizer;

      log('Reading data from page: ' + JSON.stringify(data));
      Object.keys(data).forEach(depricate, data);

      onMessage = 'onMessage' in data ? data.onMessage : onMessage;
      onReady = 'onReady' in data ? data.onReady : onReady;
      targetOriginDefault =
        'targetOrigin' in data ? data.targetOrigin : targetOriginDefault;
      heightCalcMode =
        'heightCalculationMethod' in data
          ? data.heightCalculationMethod
          : heightCalcMode;
      widthCalcMode =
        'widthCalculationMethod' in data
          ? data.widthCalculationMethod
          : widthCalcMode;
    }

    function setupCustomCalcMethods (calcMode, calcFunc) {
      if (typeof calcMode === 'function') {
        log('Setup custom ' + calcFunc + 'CalcMethod');
        customCalcMethods[calcFunc] = calcMode;
        calcMode = 'custom';
      }

      return calcMode;
    }

    if (
      'iFrameResizer' in window &&
      Object === window.iFrameResizer.constructor
    ) {
      readData();
      heightCalcMode = setupCustomCalcMethods(heightCalcMode, 'height');
      widthCalcMode = setupCustomCalcMethods(widthCalcMode, 'width');
    }

    log('TargetOrigin for parent set to: ' + targetOriginDefault);
  }

  function chkCSS (attr, value) {
    if (value.indexOf('-') !== -1) {
      warn('Negative CSS value ignored for ' + attr);
      value = '';
    }

    return value;
  }

  function setBodyStyle (attr, value) {
    if (undefined !== value && value !== '' && value !== 'null') {
      document.body.style[attr] = value;
      log('Body ' + attr + ' set to "' + value + '"');
    }
  }

  function setMargin () {
    // If called via V1 script, convert bodyMargin from int to str
    if (undefined === bodyMarginStr) {
      bodyMarginStr = bodyMargin + 'px';
    }

    setBodyStyle('margin', chkCSS('margin', bodyMarginStr));
  }

  function stopInfiniteResizingOfIFrame () {
    document.documentElement.style.height = '';
    document.body.style.height = '';
    log('HTML & body height set to "auto"');
  }

  function manageTriggerEvent (options) {
    const listener = {
      add: function (eventName) {
        function handleEvent () {
          sendSize(options.eventName, options.eventType);
        }

        eventHandlersByName[eventName] = handleEvent;

        addEventListener(window, eventName, handleEvent, { passive: true });
      },
      remove: function (eventName) {
        const handleEvent = eventHandlersByName[eventName];
        delete eventHandlersByName[eventName];

        removeEventListener(window, eventName, handleEvent);
      },
    };

    if (options.eventNames && Array.prototype.map) {
      options.eventName = options.eventNames[0];
      options.eventNames.map(listener[options.method]);
    } else {
      listener[options.method](options.eventName);
    }

    log(
      capitalizeFirstLetter(options.method) +
        ' event listener: ' +
        options.eventType
    );
  }

  function manageEventListeners (method) {
    manageTriggerEvent({
      method,
      eventType: 'Animation Start',
      eventNames: ['animationstart', 'webkitAnimationStart'],
    });
    manageTriggerEvent({
      method,
      eventType: 'Animation Iteration',
      eventNames: ['animationiteration', 'webkitAnimationIteration'],
    });
    manageTriggerEvent({
      method,
      eventType: 'Animation End',
      eventNames: ['animationend', 'webkitAnimationEnd'],
    });
    manageTriggerEvent({
      method,
      eventType: 'Input',
      eventName: 'input',
    });
    manageTriggerEvent({
      method,
      eventType: 'Mouse Up',
      eventName: 'mouseup',
    });
    manageTriggerEvent({
      method,
      eventType: 'Mouse Down',
      eventName: 'mousedown',
    });
    manageTriggerEvent({
      method,
      eventType: 'Orientation Change',
      eventName: 'orientationchange',
    });
    manageTriggerEvent({
      method,
      eventType: 'Print',
      eventNames: ['afterprint', 'beforeprint'],
    });
    manageTriggerEvent({
      method,
      eventType: 'Ready State Change',
      eventName: 'readystatechange',
    });
    manageTriggerEvent({
      method,
      eventType: 'Touch Start',
      eventName: 'touchstart',
    });
    manageTriggerEvent({
      method,
      eventType: 'Touch End',
      eventName: 'touchend',
    });
    manageTriggerEvent({
      method,
      eventType: 'Touch Cancel',
      eventName: 'touchcancel',
    });
    manageTriggerEvent({
      method,
      eventType: 'Transition Start',
      eventNames: [
        'transitionstart',
        'webkitTransitionStart',
        'MSTransitionStart',
        'oTransitionStart',
        'otransitionstart',
      ],
    });
    manageTriggerEvent({
      method,
      eventType: 'Transition Iteration',
      eventNames: [
        'transitioniteration',
        'webkitTransitionIteration',
        'MSTransitionIteration',
        'oTransitionIteration',
        'otransitioniteration',
      ],
    });
    manageTriggerEvent({
      method,
      eventType: 'Transition End',
      eventNames: [
        'transitionend',
        'webkitTransitionEnd',
        'MSTransitionEnd',
        'oTransitionEnd',
        'otransitionend',
      ],
    });

    if (resizeFrom === 'child') {
      manageTriggerEvent({
        method,
        eventType: 'IFrame Resized',
        eventName: 'resize',
      });
    }
  }

  function checkCalcMode (calcMode, calcModeDefault, modes, type) {
    if (calcModeDefault !== calcMode) {
      if (!(calcMode in modes)) {
        warn(
          calcMode + ' is not a valid option for ' + type + 'CalculationMethod.'
        );
        calcMode = calcModeDefault;
      }

      log(type + ' calculation method set to "' + calcMode + '"');
    }

    return calcMode;
  }

  function checkHeightMode () {
    heightCalcMode = checkCalcMode(
      heightCalcMode,
      heightCalcModeDefault,
      getHeight,
      'height'
    );
  }

  function checkWidthMode () {
    widthCalcMode = checkCalcMode(
      widthCalcMode,
      widthCalcModeDefault,
      getWidth,
      'width'
    );
  }

  function startEventListeners () {
    if (autoResize === true) {
      manageEventListeners('add');
      setupMutationObserver();
    } else {
      log('Auto Resize disabled');
    }
  }

  //   function stopMsgsToParent() {
  //     log('Disable outgoing messages')
  //     sendPermit = false
  //   }

  //   function removeMsgListener() {
  //     log('Remove event listener: Message')
  //     removeEventListener(window, 'message', receiver)
  //   }

  function disconnectMutationObserver () {
    if (bodyObserver !== null) {
      /* istanbul ignore next */ // Not testable in PhantonJS
      bodyObserver.disconnect();
    }
  }

  function stopEventListeners () {
    manageEventListeners('remove');
    disconnectMutationObserver();
    clearInterval(intervalTimer);
  }

  //   function teardown() {
  //     stopMsgsToParent()
  //     removeMsgListener()
  //     if (true === autoResize) stopEventListeners()
  //   }

  function injectClearFixIntoBodyElement () {
    const clearFix = document.createElement('div');
    clearFix.style.clear = 'both';
    // Guard against the following having been globally redefined in CSS.
    clearFix.style.display = 'block';
    clearFix.style.height = '0';
    document.body.appendChild(clearFix);
  }

  function setupInPageLinks () {
    function getPagePosition () {
      return {
        x:
          window.pageXOffset === undefined
            ? document.documentElement.scrollLeft
            : window.pageXOffset,
        y:
          window.pageYOffset === undefined
            ? document.documentElement.scrollTop
            : window.pageYOffset,
      };
    }

    function getElementPosition (el) {
      const elPosition = el.getBoundingClientRect();
      const pagePosition = getPagePosition();

      return {
        x: parseInt(elPosition.left, 10) + parseInt(pagePosition.x, 10),
        y: parseInt(elPosition.top, 10) + parseInt(pagePosition.y, 10),
      };
    }

    function findTarget (location) {
      function jumpToTarget (target) {
        const jumpPosition = getElementPosition(target);

        log(
          'Moving to in page link (#' +
            hash +
            ') at x: ' +
            jumpPosition.x +
            ' y: ' +
            jumpPosition.y
        );
        // X&Y reversed at sendMsg uses height/width
        sendMsg(jumpPosition.y, jumpPosition.x, 'scrollToOffset');
      }

      var hash = location.split('#')[1] || location; // Remove # if present
      const hashData = decodeURIComponent(hash);
      const target =
          document.getElementById(hashData) ||
          document.getElementsByName(hashData)[0];

      if (undefined === target) {
        log(
          'In page link (#' +
            hash +
            ') not found in iFrame, so sending to parent'
        );
        sendMsg(0, 0, 'inPageLink', '#' + hash);
      } else {
        jumpToTarget(target);
      }
    }

    function checkLocationHash () {
      const hash = window.location.hash;
      const href = window.location.href;

      if (hash !== '' && hash !== '#') {
        findTarget(href);
      }
    }

    function bindAnchors () {
      function setupLink (el) {
        function linkClicked (e) {
          e.preventDefault();

          /* jshint validthis:true */
          findTarget(this.getAttribute('href'));
        }

        if (el.getAttribute('href') !== '#') {
          addEventListener(el, 'click', linkClicked);
        }
      }

      Array.prototype.forEach.call(
        document.querySelectorAll('a[href^="#"]'),
        setupLink
      );
    }

    function bindLocationHash () {
      addEventListener(window, 'hashchange', checkLocationHash);
    }

    function initCheck () {
      // Check if page loaded with location hash after init resize
      setTimeout(checkLocationHash, eventCancelTimer);
    }

    function enableInPageLinks () {
      /* istanbul ignore else */ // Not testable in phantonJS
      if (Array.prototype.forEach && document.querySelectorAll) {
        log('Setting up location.hash handlers');
        bindAnchors();
        bindLocationHash();
        initCheck();
      } else {
        warn(
          'In page linking not fully supported in this browser!' +
          ' (See README.md for IE8 workaround)'
        );
      }
    }

    if (inPageLinks.enable) {
      enableInPageLinks();
    } else {
      log('In page linking not enabled');
    }

    return {
      findTarget,
    };
  }

  function setupMouseEvents () {
    if (mouseEvents !== true) return;

    function sendMouse (e) {
      sendMsg(0, 0, e.type, e.screenY + ':' + e.screenX);
    }

    function addMouseListener (evt, name) {
      log('Add event listener: ' + name);
      addEventListener(window.document, evt, sendMouse);
    }

    addMouseListener('mouseenter', 'Mouse Enter');
    addMouseListener('mouseleave', 'Mouse Leave');
  }

  function setupPublicMethods () {
    log('Enable public methods');

    win.parentIFrame = {
      autoResize: function autoResizeF (resize) {
        if (resize === true && autoResize === false) {
          autoResize = true;
          startEventListeners();
        } else if (resize === false && autoResize === true) {
          autoResize = false;
          stopEventListeners();
        }

        sendMsg(0, 0, 'autoResize', JSON.stringify(autoResize));

        return autoResize;
      },

      close: function closeF () {
        sendMsg(0, 0, 'close');
        // teardown()
      },

      getId: function getIdF () {
        return myID;
      },

      getPageInfo: function getPageInfoF (callback) {
        if (typeof callback === 'function') {
          onPageInfo = callback;
          sendMsg(0, 0, 'pageInfo');
        } else {
          onPageInfo = function () {};

          sendMsg(0, 0, 'pageInfoStop');
        }
      },

      moveToAnchor: function moveToAnchorF (hash) {
        inPageLinks.findTarget(hash);
      },

      reset: function resetF () {
        resetIFrame('parentIFrame.reset');
      },

      scrollTo: function scrollToF (x, y) {
        sendMsg(y, x, 'scrollTo'); // X&Y reversed at sendMsg uses height/width
      },

      scrollToOffset: function scrollToF (x, y) {
        // X&Y reversed at sendMsg uses height/width
        sendMsg(y, x, 'scrollToOffset');
      },

      sendMessage: function sendMessageF (msg, targetOrigin) {
        sendMsg(0, 0, 'message', JSON.stringify(msg), targetOrigin);
      },

      setHeightCalculationMethod: function setHeightCalculationMethodF (
        heightCalculationMethod
      ) {
        heightCalcMode = heightCalculationMethod;
        checkHeightMode();
      },

      setWidthCalculationMethod: function setWidthCalculationMethodF (
        widthCalculationMethod
      ) {
        widthCalcMode = widthCalculationMethod;
        checkWidthMode();
      },

      setTargetOrigin: function setTargetOriginF (targetOrigin) {
        log('Set targetOrigin: ' + targetOrigin);
        targetOriginDefault = targetOrigin;
      },

      size: function sizeF (customHeight, customWidth) {
        const valString =
          '' + (customHeight || '') + (customWidth ? ',' + customWidth : '');
        sendSize(
          'size',
          'parentIFrame.size(' + valString + ')',
          customHeight,
          customWidth
        );
      },
    };
  }

  function initInterval () {
    if (interval !== 0) {
      log('setInterval: ' + interval + 'ms');
      intervalTimer = setInterval(function () {
        sendSize('interval', 'setInterval: ' + interval);
      }, Math.abs(interval));
    }
  }

  // Not testable in PhantomJS
  /* istanbul ignore next */
  function setupBodyMutationObserver () {
    function addImageLoadListners (mutation) {
      function addImageLoadListener (element) {
        if (element.complete === false) {
          log('Attach listeners to ' + element.src);
          element.addEventListener('load', imageLoaded, false);
          element.addEventListener('error', imageError, false);
          elements.push(element);
        }
      }

      if (mutation.type === 'attributes' && mutation.attributeName === 'src') {
        addImageLoadListener(mutation.target);
      } else if (mutation.type === 'childList') {
        Array.prototype.forEach.call(
          mutation.target.querySelectorAll('img'),
          addImageLoadListener
        );
      }
    }

    function removeFromArray (element) {
      elements.splice(elements.indexOf(element), 1);
    }

    function removeImageLoadListener (element) {
      log('Remove listeners from ' + element.src);
      element.removeEventListener('load', imageLoaded, false);
      element.removeEventListener('error', imageError, false);
      removeFromArray(element);
    }

    function imageEventTriggered (event, type, typeDesc) {
      removeImageLoadListener(event.target);
      sendSize(type, typeDesc + ': ' + event.target.src);
    }

    function imageLoaded (event) {
      imageEventTriggered(event, 'imageLoad', 'Image loaded');
    }

    function imageError (event) {
      imageEventTriggered(event, 'imageLoadFailed', 'Image load failed');
    }

    function mutationObserved (mutations) {
      sendSize(
        'mutationObserver',
        'mutationObserver: ' + mutations[0].target + ' ' + mutations[0].type
      );

      // Deal with WebKit / Blink asyncing image loading when
      // tags are injected into the page
      mutations.forEach(addImageLoadListners);
    }

    function createMutationObserver () {
      const target = document.querySelector('body');
      const config = {
        attributes: true,
        attributeOldValue: false,
        characterData: true,
        characterDataOldValue: false,
        childList: true,
        subtree: true,
      };

      observer = new MutationObserver(mutationObserved);

      log('Create body MutationObserver');
      observer.observe(target, config);

      return observer;
    }

    var elements = [];
    var MutationObserver =
        window.MutationObserver || window.WebKitMutationObserver;
    var observer = createMutationObserver();

    return {
      disconnect: function () {
        if ('disconnect' in observer) {
          log('Disconnect body MutationObserver');
          observer.disconnect();
          elements.forEach(removeImageLoadListener);
        }
      },
    };
  }

  function setupMutationObserver () {
    const forceIntervalTimer = interval < 0;

    // Not testable in PhantomJS
    /* istanbul ignore if */ if (
      window.MutationObserver ||
      window.WebKitMutationObserver
    ) {
      if (forceIntervalTimer) {
        initInterval();
      } else {
        bodyObserver = setupBodyMutationObserver();
      }
    } else {
      log('MutationObserver not supported in this browser!');
      initInterval();
    }
  }

  // document.documentElement.offsetHeight is not reliable, so
  // we have to jump through hoops to get a better value.
  function getComputedStyle (prop, el) {
    let retVal = 0;
    el = el || document.body; // Not testable in phantonJS

    retVal = document.defaultView.getComputedStyle(el, null);
    retVal = retVal === null ? 0 : retVal[prop];

    return parseInt(retVal, base);
  }

  function chkEventThottle (timer) {
    if (timer > throttledTimer / 2) {
      throttledTimer = 2 * timer;
      log('Event throttle increased to ' + throttledTimer + 'ms');
    }
  }

  // Idea from https://github.com/guardian/iframe-messenger
  function getMaxElement (side, elements) {
    const elementsLength = elements.length;
    let elVal = 0;
    let maxVal = 0;
    const Side = capitalizeFirstLetter(side);
    let timer = Date.now();

    for (let i = 0; i < elementsLength; i++) {
      elVal =
        elements[i].getBoundingClientRect()[side] +
        getComputedStyle('margin' + Side, elements[i]);

      if (elVal > maxVal) {
        maxVal = elVal;
      }
    }

    timer = Date.now() - timer;

    log('Parsed ' + elementsLength + ' HTML elements');
    log('Element position calculated in ' + timer + 'ms');

    chkEventThottle(timer);

    return maxVal;
  }

  function getAllMeasurements (dimensions) {
    return [
      dimensions.bodyOffset(),
      dimensions.bodyScroll(),
      dimensions.documentElementOffset(),
      dimensions.documentElementScroll(),
    ];
  }

  function getTaggedElements (side, tag) {
    function noTaggedElementsFound () {
      warn('No tagged elements (' + tag + ') found on page');

      return document.querySelectorAll('body *');
    }

    const elements = document.querySelectorAll('[' + tag + ']');

    if (elements.length === 0) noTaggedElementsFound();

    return getMaxElement(side, elements);
  }

  function getAllElements () {
    return document.querySelectorAll('body *');
  }

  var getHeight = {
    bodyOffset: function getBodyOffsetHeight () {
      return (
        document.body.offsetHeight +
          getComputedStyle('marginTop') +
          getComputedStyle('marginBottom')
      );
    },

    offset: function () {
      return getHeight.bodyOffset(); // Backwards compatibility
    },

    bodyScroll: function getBodyScrollHeight () {
      return document.body.scrollHeight;
    },

    custom: function getCustomWidth () {
      return customCalcMethods.height();
    },

    documentElementOffset: function getDEOffsetHeight () {
      return document.documentElement.offsetHeight;
    },

    documentElementScroll: function getDEScrollHeight () {
      return document.documentElement.scrollHeight;
    },

    max: function getMaxHeight () {
      return Math.max.apply(null, getAllMeasurements(getHeight));
    },

    min: function getMinHeight () {
      return Math.min.apply(null, getAllMeasurements(getHeight));
    },

    grow: function growHeight () {
      return getHeight.max(); // Run max without the forced downsizing
    },

    lowestElement: function getBestHeight () {
      return Math.max(
        getHeight.bodyOffset() || getHeight.documentElementOffset(),
        getMaxElement('bottom', getAllElements())
      );
    },

    taggedElement: function getTaggedElementsHeight () {
      return getTaggedElements('bottom', 'data-iframe-height');
    },
  };
  var getWidth = {
    bodyScroll: function getBodyScrollWidth () {
      return document.body.scrollWidth;
    },

    bodyOffset: function getBodyOffsetWidth () {
      return document.body.offsetWidth;
    },

    custom: function getCustomWidth () {
      return customCalcMethods.width();
    },

    documentElementScroll: function getDEScrollWidth () {
      return document.documentElement.scrollWidth;
    },

    documentElementOffset: function getDEOffsetWidth () {
      return document.documentElement.offsetWidth;
    },

    scroll: function getMaxWidth () {
      return Math.max(getWidth.bodyScroll(), getWidth.documentElementScroll());
    },

    max: function getMaxWidth () {
      return Math.max.apply(null, getAllMeasurements(getWidth));
    },

    min: function getMinWidth () {
      return Math.min.apply(null, getAllMeasurements(getWidth));
    },

    rightMostElement: function rightMostElement () {
      return getMaxElement('right', getAllElements());
    },

    taggedElement: function getTaggedElementsWidth () {
      return getTaggedElements('right', 'data-iframe-width');
    },
  };

  function sizeIFrame (
    triggerEvent,
    triggerEventDesc,
    customHeight,
    customWidth
  ) {
    function resizeIFrame () {
      height = currentHeight;
      width = currentWidth;

      sendMsg(height, width, triggerEvent);
    }

    function isSizeChangeDetected () {
      function checkTolarance (a, b) {
        const retVal = Math.abs(a - b) <= tolerance;

        return !retVal;
      }

      currentHeight =
        undefined === customHeight ? getHeight[heightCalcMode]() : customHeight;
      currentWidth =
        undefined === customWidth ? getWidth[widthCalcMode]() : customWidth;

      return (
        checkTolarance(height, currentHeight) ||
        (calculateWidth && checkTolarance(width, currentWidth))
      );
    }

    function isForceResizableEvent () {
      return !(triggerEvent in { init: 1, interval: 1, size: 1 });
    }

    function isForceResizableCalcMode () {
      return (
        heightCalcMode in resetRequiredMethods ||
        (calculateWidth && widthCalcMode in resetRequiredMethods)
      );
    }

    function logIgnored () {
      log('No change in size detected');
    }

    function checkDownSizing () {
      if (isForceResizableEvent() && isForceResizableCalcMode()) {
        resetIFrame(triggerEventDesc);
      } else if (!(triggerEvent in { interval: 1 })) {
        logIgnored();
      }
    }

    let currentHeight, currentWidth;

    if (isSizeChangeDetected() || triggerEvent === 'init') {
      lockTrigger();
      resizeIFrame();
    } else {
      checkDownSizing();
    }
  }

  const sizeIFrameThrottled = throttle(sizeIFrame);

  function sendSize (
    triggerEvent,
    triggerEventDesc,
    customHeight,
    customWidth
  ) {
    function recordTrigger () {
      if (!(triggerEvent in { reset: 1, resetPage: 1, init: 1 })) {
        log('Trigger event: ' + triggerEventDesc);
      }
    }

    function isDoubleFiredEvent () {
      return triggerLocked && triggerEvent in doubleEventList;
    }

    if (isDoubleFiredEvent()) {
      log('Trigger event cancelled: ' + triggerEvent);
    } else {
      recordTrigger();

      if (triggerEvent === 'init') {
        sizeIFrame(triggerEvent, triggerEventDesc, customHeight, customWidth);
      } else {
        sizeIFrameThrottled(
          triggerEvent,
          triggerEventDesc,
          customHeight,
          customWidth
        );
      }
    }
  }

  function lockTrigger () {
    if (!triggerLocked) {
      triggerLocked = true;
      log('Trigger event lock on');
    }

    clearTimeout(triggerLockedTimer);
    triggerLockedTimer = setTimeout(function () {
      triggerLocked = false;
      log('Trigger event lock off');
      log('--');
    }, eventCancelTimer);
  }

  function triggerReset (triggerEvent) {
    height = getHeight[heightCalcMode]();
    width = getWidth[widthCalcMode]();

    sendMsg(height, width, triggerEvent);
  }

  function resetIFrame (triggerEventDesc) {
    const hcm = heightCalcMode;
    heightCalcMode = heightCalcModeDefault;

    log('Reset trigger event: ' + triggerEventDesc);
    lockTrigger();
    triggerReset('reset');

    heightCalcMode = hcm;
  }

  function sendMsg (height, width, triggerEvent, msg, targetOrigin) {
    function setTargetOrigin () {
      if (undefined === targetOrigin) {
        targetOrigin = targetOriginDefault;
      } else {
        log('Message targetOrigin: ' + targetOrigin);
      }
    }

    function sendToParent () {
      const size = height + ':' + width;
      const message =
          myID +
          ':' +
          size +
          ':' +
          triggerEvent +
          (undefined === msg ? '' : ':' + msg);

      log('Sending message to host page (' + message + ')');
      target.postMessage(msgID + message, targetOrigin);
    }

    if (sendPermit === true) {
      setTargetOrigin();
      sendToParent();
    }
  }

  function receiver (event) {
    const processRequestFromParent = {
      init: function initFromParent () {
        initMsg = event.data;
        target = event.source;

        init();
        firstRun = false;
        setTimeout(function () {
          initLock = false;
        }, eventCancelTimer);
      },

      reset: function resetFromParent () {
        if (initLock) {
          log('Page reset ignored by init');
        } else {
          log('Page size reset by host page');
          triggerReset('resetPage');
        }
      },

      resize: function resizeFromParent () {
        sendSize('resizeParent', 'Parent window requested size check');
      },

      moveToAnchor: function moveToAnchorF () {
        inPageLinks.findTarget(getData());
      },
      inPageLink: function inPageLinkF () {
        this.moveToAnchor();
      }, // Backward compatibility

      pageInfo: function pageInfoFromParent () {
        const msgBody = getData();
        log('PageInfoFromParent called from parent: ' + msgBody);
        onPageInfo(JSON.parse(msgBody));
        log(' --');
      },

      message: function messageFromParent () {
        const msgBody = getData();

        log('onMessage called from parent: ' + msgBody);
        onMessage(JSON.parse(msgBody));
        log(' --');
      },
    };

    function isMessageForUs () {
      // ''+ Protects against non-string messages
      return msgID === ('' + event.data).slice(0, msgIdLen);
    }

    function getMessageType () {
      return event.data.split(']')[1].split(':')[0];
    }

    function getData () {
      return event.data.slice(event.data.indexOf(':') + 1);
    }

    function isMiddleTier () {
      return (
        (!(typeof module !== 'undefined' && module.exports) &&
          'iFrameResize' in window) ||
        (
          window.jQuery !== undefined &&
          'iFrameResize' in window.jQuery.prototype
        )
      );
    }

    function isInitMsg () {
      // Test if this message is from a child below us.
      // This is an ugly test, however, updating
      // the message format would break backwards compatibility.
      return event.data.split(':')[2] in { true: 1, false: 1 };
    }

    function callFromParent () {
      const messageType = getMessageType();

      if (messageType in processRequestFromParent) {
        processRequestFromParent[messageType]();
      } else if (!isMiddleTier() && !isInitMsg()) {
        warn('Unexpected message (' + event.data + ')');
      }
    }

    function processMessage () {
      if (firstRun === false) {
        callFromParent();
      } else if (isInitMsg()) {
        processRequestFromParent.init();
      } else {
        log(
          'Ignored message of type "' +
            getMessageType() +
            '". Received before initialization.'
        );
      }
    }

    if (isMessageForUs()) {
      processMessage();
    }
  }

  // Normally the parent kicks things off when it detects the iFrame has loaded.
  // If this script is async-loaded, then tell parent page to retry init.
  function chkLateLoaded () {
    if (document.readyState !== 'loading') {
      window.parent.postMessage('[iFrameResizerChild]Ready', '*');
    }
  }

  addEventListener(window, 'message', receiver);
  addEventListener(window, 'readystatechange', chkLateLoaded);
  chkLateLoaded();

  // TEST CODE START //

  // Create test hooks

  function mockMsgListener (msgObject) {
    receiver(msgObject);

    return win;
  }

  win = {};

  removeEventListener(window, 'message', receiver);

  // eslint-disable-next-line no-undef
  define([], function () {
    return mockMsgListener;
  });

  // TEST CODE END //
})();
