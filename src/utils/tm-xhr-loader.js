/**
 * Tamper Monkey used XHR based logger
*/

import { logger } from '../utils/logger';

const { performance, XMLHttpRequest } = window;

class TMXmlhttpRequest {
  constructor () {
    this._tmxhr = null;
    this._config = {
      e: {},
      headers: {
        'Referer': window.location.href,
        'User-Agent': window.navigator.userAgent
      }
    };
  }

  destroy () {
    this.abort();
    this._tmxhr = null;
    this._config = null;
  }

  _decorateXhr (e) {
    let xhr = e;
    if (this._useNative) {
      return xhr;
    } else {
      this._readyState = e.readyState;
      for (let k in e) {
        if (k.toString() === 'finalUrl') {
          xhr.responseURL = e.finalUrl;
        } else {
          xhr[k] = e[k];
        }
      }
      xhr.currentTarget = e;
    }
    return xhr;
  }

  open (method, url) {
    this._config.method = method;
    this._config.url = url;
    if (url.startsWith('blob:')) {
      this._useNative = true;
      let xhr = this._tmxhr = new XMLHttpRequest();
      xhr.open(method, url, true);
    }
  }

  send () {
    if (this._useNative) {
      for (let ev in this._config.e) {
        this._tmxhr[ev] = this._config.e[ev];
      }
      let headers = this._config.headers;
      for (let name in headers) {
        try {
          this._tmxhr.setRequestHeader(name, headers[name]);
        } catch (e) { // ignore
        }
      }
      this._tmxhr.send();
    } else {
      for (let ev in this._config.e) {
        this._config[ev] = this._config.e[ev];
      }
      this._tmxhr = GM_xmlhttpRequest(this._config);
    }
  }

  abort () {
    if (this._tmxhr) {
      this._tmxhr.abort();
    }
  }

  setRequestHeader (name, value) {
    let headers = this._config.headers;
    headers[name] = value;
  }

  set responseType (responseType) {
    this._config.responseType = responseType;
  }

  get responseType () {
    return this._config.responseType;
  }

  get readyState () {
    return this._useNative ? this._tmxhr.readyState : this._readyState;
  }

  set onreadystatechange (callback) {
    this._onreadystatechange = callback;
    this._config.e.onreadystatechange = e => {
      let xhr = this._decorateXhr(e);
      if (this._onreadystatechange) {
        this._onreadystatechange(xhr);
      }
    };
  }

  get onreadystatechange () {
    return this._onreadystatechange;
  }

  set onprogress (callback) {
    this._onprogress = callback;
    this._config.e.onprogress = e => {
      let xhr = this._decorateXhr(e);
      if (this._onprogress) {
        this._onprogress(xhr);
      }
    };
  }

  get onprogress () {
    return this._onprogress;
  }

  set onload (callback) {
    this._onload = callback;
    this._config.e.onload = e => {
      let xhr = this._decorateXhr(e);
      if (this._onload) {
        this._onload(xhr);
      }
    };
  }

  get onload () {
    return this._onload;
  }

  set onerror (callback) {
    this._onerror = callback;
    this._config.e.onerror = e => {
      let xhr = this._decorateXhr(e);
      if (this._onerror) {
        this._onerror(xhr);
      }
    };
  }

  get onerror () {
    return this._onerror;
  }
}

class TMXhrLoader {
  constructor (config) {
    if (config && config.xhrSetup) {
      this.xhrSetup = config.xhrSetup;
    }
  }

  destroy () {
    this.abort();
    this.loader = null;
  }

  abort () {
    let loader = this.loader;
    if (loader && loader.readyState !== 4) {
      this.stats.aborted = true;
      loader.abort();
    }

    window.clearTimeout(this.requestTimeout);
    this.requestTimeout = null;
    window.clearTimeout(this.retryTimeout);
    this.retryTimeout = null;
  }

  load (context, config, callbacks) {
    this.context = context;
    this.config = config;
    this.callbacks = callbacks;
    this.stats = { trequest: performance.now(), retry: 0 };
    this.retryDelay = config.retryDelay;
    this.loadInternal();
  }

  loadInternal () {
    let xhr, context = this.context;
    xhr = this.loader = new TMXmlhttpRequest();

    let stats = this.stats;
    stats.tfirst = 0;
    stats.loaded = 0;
    const xhrSetup = this.xhrSetup;
    if (xhrSetup) {
      xhrSetup(xhr, context.url);
    }
    if (context.rangeEnd) {
      xhr.setRequestHeader('Range', 'bytes=' + context.rangeStart + '-' + (context.rangeEnd - 1));
    }

    xhr.onreadystatechange = this.readystatechange.bind(this);
    xhr.onprogress = this.loadprogress.bind(this);
    xhr.responseType = context.responseType;

    xhr.open('GET', context.url);
    // setup timeout before we perform request
    this.requestTimeout = window.setTimeout(this.loadtimeout.bind(this), this.config.timeout);
    xhr.send();
  }

  readystatechange (event) {
    let xhr = event.currentTarget,
      readyState = xhr.readyState,
      stats = this.stats,
      context = this.context,
      config = this.config;

    // don't proceed if xhr has been aborted
    if (stats.aborted) {
      return;
    }

    // >= HEADERS_RECEIVED
    if (readyState >= 2) {
      // clear xhr timeout and rearm it if readyState less than 4
      window.clearTimeout(this.requestTimeout);
      if (stats.tfirst === 0) {
        stats.tfirst = Math.max(performance.now(), stats.trequest);
      }

      if (readyState === 4) {
        let status = xhr.status;
        // http status between 200 to 299 are all successful
        if (status >= 200 && status < 300) {
          stats.tload = Math.max(stats.tfirst, performance.now());
          let data, len;
          if (context.responseType === 'arraybuffer') {
            data = xhr.response;
            len = data.byteLength;
          } else {
            data = xhr.responseText;
            len = data.length;
          }
          stats.loaded = stats.total = len;
          let response = { url: xhr.responseURL, data: data };
          this.callbacks.onSuccess(response, stats, context, xhr);
        } else {
          // if max nb of retries reached or if http status between 400 and 499 (such error cannot be recovered, retrying is useless), return error
          if (stats.retry >= config.maxRetry || (status >= 400 && status < 499)) {
            logger.error(`${status} while loading ${context.url}`);
            this.callbacks.onError({ code: status, text: xhr.statusText }, context, xhr);
          } else {
            // retry
            logger.warn(`${status} while loading ${context.url}, retrying in ${this.retryDelay}...`);
            // aborts and resets internal state
            this.destroy();
            // schedule retry
            this.retryTimeout = window.setTimeout(this.loadInternal.bind(this), this.retryDelay);
            // set exponential backoff
            this.retryDelay = Math.min(2 * this.retryDelay, config.maxRetryDelay);
            stats.retry++;
          }
        }
      } else {
        // readyState >= 2 AND readyState !==4 (readyState = HEADERS_RECEIVED || LOADING) rearm timeout as xhr not finished yet
        this.requestTimeout = window.setTimeout(this.loadtimeout.bind(this), config.timeout);
      }
    }
  }

  loadtimeout () {
    logger.warn(`timeout while loading ${this.context.url}`);
    this.callbacks.onTimeout(this.stats, this.context, null);
  }

  loadprogress (event) {
    let xhr = event.currentTarget,
      stats = this.stats;

    stats.loaded = event.loaded;
    if (event.lengthComputable) {
      stats.total = event.total;
    }

    let onProgress = this.callbacks.onProgress;
    if (onProgress) {
      // third arg is to provide on progress data
      onProgress(stats, this.context, null, xhr);
    }
  }
}

export default TMXhrLoader;
