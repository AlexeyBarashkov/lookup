import {KEYS} from '../config/config'

/* TYPEAHEAD PUBLIC CLASS DEFINITION
 * ================================= */

var Typeahead = function(element, options) {
  this.$element = $(element);
  this.options = $.extend({}, $.fn.typeahead.defaults, options);
  this.value = this.options.value || this.value;
  this.matcher = this.options.matcher || this.matcher;
  this.sorter = this.options.sorter || this.sorter;
  this.highlighter = this.options.highlighter || this.highlighter;
  this.updater = this.options.updater || this.updater;
  this.source = this.options.source;
  var lazyRequest = _.debounce(_.bind(this.request, this), this.options.debounce);
  this.request = function() {
    this.abortRequest().hide();
    lazyRequest.apply(this, arguments);
  };
  var lazyCustomRequest = _.debounce(_.bind(this.customRequest, this), this.options.debounce);
  this.customRequest = function() {
    this.abortRequest().hide();
    lazyCustomRequest.apply(this, arguments);
  };
  this.$menu = $(this.options.menu);
  this.$itemsContainer = this.$menu.find('ul');
  this.shown = false;
  this.listen();
};

Typeahead.prototype = {

  constructor: Typeahead,

  select: function() {
    var item = this.$itemsContainer.find('.active'),
      itemData = item.data('typeahead-value'),
      isEmpty = item.data('typeahead-empty'),
      value;

    if (isEmpty) {
      return this;
    }

    value = this.updater(itemData);

    this.$element
      .val(value)
      .data('typeahead-selected-data', itemData)
      .change()
      .trigger('typeahead:select', [value, itemData])
      .trigger('typeahead:blur');

    return this.hide();
  },

  updater: function(item) {
    return this.value(item);
  },

  show: function() {
    var $menu = this.$menu,
      offset = this.options.container === 'body' ? this.$element.offset() : this.$element.position(),
      pos = $.extend({
        height: this.$element[0].offsetHeight
      }, offset);

    if (this.options.container) {
      $menu.appendTo(this.options.container);
    } else {
      $menu.insertAfter(this.$element);
    }

    $menu
      .css(_.extend({
        //top: pos.top + pos.height,
        top: pos.top + this.$element.offsetParent().scrollTop() + pos.height, // fix (need to be reviewed) AG-744
        left: pos.left,
        'min-width': this.$element.outerWidth()
      }, this.options.fitInputWidth ? {
        'max-width': this.$element.outerWidth()
      } : {}))
      .show();

    this.shown = true;
    return this;
  },

  hide: function() {
    this.$menu.hide();
    this.shown = false;
    return this;
  },

  lookup: function(eventType) {
    var items;

    // Now supports empty queries (eg. with a length of 0).
    this.query = this.$element.val() || '';

    if (this.options.trimQuery) {
      this.query = this.query.trim();
    }

    if (eventType === 'key' && _.isEmpty(this.query)) {
      this.$element.data('typeahead-selected-data', null)
        .trigger('typeahead:query-cleared');
    }

    if (this.query.length < this.options.minLength) {
      return this.shown ? this.hide() : this;
    }

    items = $.isFunction(this.source)
      ? this.source(this.query, $.proxy(function (items) {
          return this.focused ? this.process(items) : this;
        }, this))
      : this.source;

    return items ? this.process(items) : this;
  },

  value: function(item) {
    return item;
  },

  process: function(items) {
    var that = this,
      itemsMap,
      isEmpty;

    // looking for contacts array in data field or in root of the response
    items = items.data || items;

    // convert to map
    if(_.isArray(items)) {
      itemsMap = {
        '': items
      };
    } else {
      itemsMap = items;
    }

    _.each(itemsMap, function(items, group, map) {
      map[group] = this.processItems(items);
    }, this);

    isEmpty = _.every(itemsMap, function(items) {
      return items.length === 0;
    });

    if (!this.options.emptyItem && isEmpty) {
      return this.shown ? this.hide() : this;
    }

    return this.render(itemsMap, isEmpty).show();
  },

  processItems: function(items) {
    var that = this;

    items = $.grep(items, function(item) {
      return that.matcher(item);
    });

    return this.sorter(items);
  },

  matcher: function(item) {
    var value = this.value(item);
    return value && value.toLowerCase().indexOf(this.query.toLowerCase()) >= 0;
  },

  sorter: function(items) {
    var beginswith = [],
      caseSensitive = [],
      caseInsensitive = [],
      item,
      value;

    for (var i = 0, l = items.length; i < l; i++) {
      item = items[i];
      value = this.value(item);
      if (!value.toLowerCase().indexOf(this.query.toLowerCase())) {
        beginswith.push(item);
      } else if (value.indexOf(this.query) >= 0) {
        caseSensitive.push(item);
      } else {
        caseInsensitive.push(item);
      }
    }

    return beginswith.concat(caseSensitive, caseInsensitive);
  },

  highlighter: function(item) {
    var query = this.query.replace(/[\-\[\]{}()*+?.,\\\^$|#\s]/g, '\\$&');
    return item.replace(new RegExp('(' + query + ')', 'ig'), function($1, match) {
      return '<span class="semi-bold">' + match + '</span>';
    });
  },

  render: function(itemsMap, isEmpty) {
    var html = [];

    if (isEmpty) {
      html = this.renderEmptyItem();
    } else {
      _.each(itemsMap, function(items, group) {
        if (items.length) {
          html = html.concat(this.renderItems(items, group))
        }
      }, this);
    }

    this.$itemsContainer.html(html);

    if (this.options.autoselect) {
      this.$itemsContainer.children(':not(.typeahead-not-selectable)').first().addClass('active');
    }

    return this;
  },

  renderItems(items, group) {
    var renderer = this.options.item,
      groupTemplate = this.options.group,
      itemsHtml;

    itemsHtml = _.map(items, function(item) {
      var html = $.isFunction(renderer) ?
        $(renderer.call(this, item)) :
        $(renderer).find('a').html(this.value(item)).end();

      html.data('typeahead-value', item);

      return html[0];
    }, this);

    if (group) {
      var groupHtml = $(groupTemplate).find('h4').text(group).end();
      itemsHtml.splice(0, 0, groupHtml[0]);
    }

    return itemsHtml;
  },

  renderEmptyItem() {
    var that = this,
      emptyRenderer = this.options.emptyItem;

    return ($.isFunction(emptyRenderer) ?
      $(emptyRenderer.call(that)) :
      $(emptyRenderer)).data('typeahead-empty', true);
  },

  next: function() {
    var active = this.$itemsContainer.find('.active').removeClass('active'),
      next = active.nextAll(':not(.typeahead-not-selectable)').first();

    if (!next.length) {
      next = $(this.$itemsContainer.find('li:not(.typeahead-not-selectable)')[0]);
    }

    if (next.length) {
      next.addClass('active');
      this._ensureVisible(next);
    }
  },

  prev: function() {
    var active = this.$itemsContainer.find('.active').removeClass('active'),
      prev = active.prevAll(':not(.typeahead-not-selectable)').first();

    if (!prev.length) {
      prev = this.$itemsContainer.find('li:not(.typeahead-not-selectable)').last();
    }

    if (prev.length) {
      prev.addClass('active');
      this._ensureVisible(prev);
    }
  },

  _ensureVisible: function($el) {
    var elTop, elBottom, menuScrollTop, menuHeight;

    elTop = $el.position().top;
    elBottom = elTop + $el.outerHeight(true);
    menuScrollTop = this.$menu.scrollTop();
    menuHeight = this.$menu.height() +
      parseInt(this.$menu.css('paddingTop'), 10) +
      parseInt(this.$menu.css('paddingBottom'), 10);

    if (elTop < 0) {
      this.$menu.scrollTop(menuScrollTop + elTop);
    }

    else if (menuHeight < elBottom) {
      this.$menu.scrollTop(menuScrollTop + (elBottom - menuHeight));
    }
  },

  listen: function() {
    this.$element
      .on('focus', $.proxy(this.focus, this))
      .on('blur', $.proxy(this.blur, this))
      .on('keypress', $.proxy(this.keypress, this))
      .on('keyup', $.proxy(this.keyup, this));

    if (this.eventSupported('keydown')) {
      this.$element.on('keydown', $.proxy(this.keydown, this));
    }

    this.$menu
      .on('click', $.proxy(this.click, this))
      .on('mouseenter', 'li', $.proxy(this.mouseenter, this))
      .on('mouseleave', 'li', $.proxy(this.mouseleave, this));
  },

  eventSupported: function(eventName) {
    var isSupported = eventName in this.$element;
    if (!isSupported) {
      this.$element.setAttribute(eventName, 'return;');
      isSupported = typeof this.$element[eventName] === 'function';
    }
    return isSupported;
  },

  move: function(e) {
    if (!this.shown) {
      return;
    }

    switch (e.keyCode) {
      case KEYS.TAB:
      case KEYS.ENTER:
      case KEYS.ESCAPE:
        e.preventDefault();
        break;

      case KEYS.UP_ARROW:
        e.preventDefault();
        this.prev();
        break;

      case KEYS.DOWN_ARROW:
        e.preventDefault();
        this.next();
        break;
    }

    e.stopPropagation();
  },

  keydown: function(e) {
    this.suppressKeyPressRepeat = $.inArray(e.keyCode, [KEYS.DOWN_ARROW, KEYS.UP_ARROW, KEYS.ENTER, KEYS.ESCAPE]);
    this.move(e);
  },

  keypress: function(e) {
    if (this.suppressKeyPressRepeat) {
      return;
    }
    this.move(e);
  },

  keyup: function (e) {
    switch (e.keyCode) {
      case KEYS.DOWN_ARROW:
      case KEYS.UP_ARROW:
      case KEYS.SHIFT:
      case KEYS.CTRL:
      case KEYS.ALT:
        break;

      case KEYS.ENTER:
        if (!this.shown) {
          return;
        }
        this.select();
        break;

      case KEYS.TAB:
      case KEYS.ESCAPE:
        if (!this.shown) {
          return;
        }
        this.hide();
        return;

      default:
        this.lookup('key');
    }

    e.stopPropagation();
    e.preventDefault();
  },

  focus: function() {
    this.focused = true;
    this.$element.select();
    if (!this.mousedover) {
      this.lookup('focus');
    }
  },

  blur: function() {
    this.abortRequest();

    this.focused = false;
    if (!this.mousedover && this.shown) {
      this.hide();
    }
    if (!this.mousedover) {
      if (!this.$element.val()) {
        // if on blur we have empty input, value should be deleted
        this.$element.data('typeahead-selected-data', null);
      }
      this.$element.trigger('typeahead:blur');
    }
  },

  click: function(e) {
    e.stopPropagation();
    e.preventDefault();
    // check selectable element is clicked
    if($(e.target).parentsUntil(e.currentTarget, '.typeahead-not-selectable').length === 0) {
      this.select();
    } else {
      this.$element.focus();
    }
  },

  mouseenter: function(e) {
    this.mousedover = true;

    if(!$(e.currentTarget).hasClass('typeahead-not-selectable')) {
      this.$itemsContainer.find('.active').removeClass('active');
      $(e.currentTarget).addClass('active');
    }
  },

  mouseleave: function() {
    this.mousedover = false;
    if (!this.focused && this.shown) {
      this.hide();
    }
  },


  // gets function which should return promise,
  customRequest: function(promiseGenerator, success) {
    if (this.focused) {
      this.$element.trigger('typeahead:request:start');

      this.xhr = promiseGenerator();
      this.xhr
        .always(() => {
          this.$element.trigger('typeahead:request:complete');
        })
        .done((...args) => {
          this.$element.trigger('typeahead:request:success');
          success(...args);
        });
    }
  },

  request: function(params) {
    var complete = params.complete,
      success = params.success;

    if (this.focused) {
      this.$element.trigger('typeahead:request:start');

      this.xhr = $.ajax($.extend({
        dataType: 'json',
        contentType: 'application/json'
      }, _.omit(params, 'success', 'complete')));

      this.xhr
        .always((...args) => {
          this.$element.trigger('typeahead:request:complete');
          complete && complete.apply(this, args);
        })
        .done((...args) => {
          this.$element.trigger('typeahead:request:success');
          success && success.apply(this, args);
        });
    }
  },

  abortRequest: function() {
    if (this.xhr) {
      this.xhr.abort();

      this.$element.trigger('typeahead:request:complete');
    }
    return this;
  }

};

/* TYPEAHEAD PLUGIN DEFINITION
 * =========================== */

var old = $.fn.typeahead;

$.fn.typeahead = function(option) {
  return this.each(function() {
    var $this = $(this),
      data = $this.data('typeahead'),
      options = typeof option === 'object' && option;
    if (!data) {
      data = new Typeahead(this, options);
      $this.data('typeahead', data);
    }
    if (typeof option === 'string') {
      data[option]();
    }
  });
};

$.fn.typeahead.defaults = {
  source: [],
  debounce: 150,
  autoselect: true,
  container: 'body',
  fitInputWidth: false,
  trimQuery: false,
  items: 5,
  menu: '<div class="typeahead dropdown-menu"><ul class="inline-block"></ul></div>',
  item: '<li><a href="#"></a></li>',
  group: '<li class="typeahead-group typeahead-not-selectable x--bb x--mh-s"><h4 class="x--mb-n"></h4></li>',
  minLength: 1,
  removable: false
};

$.fn.typeahead.Constructor = Typeahead;

/* TYPEAHEAD NO CONFLICT
 * =================== */

$.fn.typeahead.noConflict = function() {
  $.fn.typeahead = old;
  return this;
};
