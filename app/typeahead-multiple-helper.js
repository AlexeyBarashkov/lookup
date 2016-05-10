import {KEYS} from '../config/config'

/* TYPEAHEAD MULTIPLE PUBLIC CLASS DEFINITION
 * ================================= */

var TypeaheadMultiple = function(element, options) {
  this.$element = $(element); // binded on it
  this.options = $.extend({}, $.fn.typeaheadMultiple.defaults, options);
  this.value = this.options.value || this.value;
  this.filterItemsByExistentValues = this.options.filterItemsByExistentValues || this.filterItemsByExistentValues;
  this.valueTemplate = this.options.valueTemplate || this.valueTemplate;
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
  this.$menu = $(this.options.menu);
  this.$itemsContainer = this.$menu.find('ul');
  this.shown = false;
  var disabled = this.$element.is('.disabled') || this.$element.is('[disabled]');

  this.$input = $(`<input type="text" class="clean x--ml-xs x--pb-xs" style="width: 15px; min-width: 15px; max-width: 100%;"
    ${disabled ? 'disabled' : ''}>`)
    .appendTo(this.$element);

  if (this.options.filterInput) { // filterInput is RegExp or function
    this._isValidInput = (function(filterInput, $inputField) {
      if (_.isFunction(filterInput)) {
        return function(newValue, input) {
          return filterInput.call($inputField, newValue, input);
        }
      } else {
        return function(newValue) {
          return filterInput.test(newValue);
        }
      }
    })(this.options.filterInput, this.$input);
  }

  this.listen();
  this.setValues(options.values);
};

TypeaheadMultiple.prototype = {

  constructor: TypeaheadMultiple,

  // public set method
  setValues: function(values) {
    // saving values in element data
    this.$element.data('typeahead-values', values);
    // updating presentation
    this._setValuesToPresentation(values);
  },

  // private set method with triggering change events
  _setValues(values, itemData) {
    this.setValues(values);
    // triggering change events
    this.$element
      .change()
      .trigger('typeahead-multiple:select', [values, itemData])
      .trigger('typeahead-multiple:blur');
  },

  _setValuesToPresentation: function(values) {
    this.$element.find('.typeahead-selected-value').remove();
    var elements = $();
    _.each(values, function(value, index) {
      elements = elements.add($(this.valueTemplate(value)).data('typeahead-value', value).data('typeahead-index', index));
    }, this);
    this.$element.prepend(elements);
  },

  valueTemplate: function(value) {
    return `<div class="pill micro typeahead-selected-value x--mr-xs x--mb-xs">
              <span title="${value}" class="block ellipsis">${value}</span>
              <a><i class="icon-cross3 hover" data-remove="typeahead-value"></i></a>
            </div>`;
  },

  // on item selected from list
  select: function() {
    var item = this.$itemsContainer.find('.active'),
      itemData = item.data('typeahead-multiple-value'),
      isEmpty = item.data('typeahead-multiple-empty'),
      values = this.$element.data('typeahead-values'),
      value;

    if (!itemData || isEmpty) {
      return this;
    }

    value = this.updater(itemData);
    values.push(value);

    this._setValues(values, itemData);

    this.$input.val('');

    this.hide();
    this.$input.focus();
  },

  updater: function(item) {
    return this.value(item);
  },

  // show list
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

  lookup: function() {
    var items;

    // Now supports empty queries (eg. with a length of 0).
    this.query = this.$input.val() || '';

    if (this.options.trimQuery) {
      this.query = this.query.trim();
    }

    if (this.query.length < this.options.minLength) {
      return this.shown ? this.hide() : this;
    }

    items = $.isFunction(this.source) ? this.source(this.query, $.proxy(function(items) {
      return this.focused ? this.process(_.deepClone(items)) : this;
    }, this)) : this.source;

    items = _.deepClone(items);

    return items ? this.process(items) : this;
  },

  process: function(items) {
    var values = this.$element.data('typeahead-values'),
      itemsMap,
      isEmpty;

    // looking for contacts array in data field or in root of the response
    items = items.data || items;

    // convert to map
    if (_.isArray(items)) {
      itemsMap = {
        '': items
      };
    } else {
      itemsMap = items;
    }

    _.each(itemsMap, function(items, group, map) {
      map[group] = this.processItems(items, values);
    }, this);

    isEmpty = _.every(itemsMap, function(items) {
      return items.length === 0;
    });

    if (!this.options.emptyItem && isEmpty) {
      return this.shown ? this.hide() : this;
    }

    // not applicable
    //if (_.isNumber(this.options.items)) {
    //  items = items.slice(0, this.options.items);
    //}

    return this.render(itemsMap, isEmpty).show();
  },

  processItems: function(items, values) {
    var that = this,
      index,
      itemsValues;

    _.each(values, function(value) {
      // pluck relevant items values to search in
      items = _.filter(items, function(item, index, items) {
        return this.filterItemsByExistentValues(item, value);
      }, this);
    }, this);

    items = $.grep(items, function(item) {
      return that.matcher(item);
    });

    return this.sorter(items);
  },

  filterItemsByExistentValues: function(item, value) {
    return !(this.value(item) === value);
  },

  render: function(itemsMap, isEmpty) {
    var html = [];

    if (isEmpty) {
      html = this.renderEmptyItem();
    } else {
      _.each(itemsMap, function(items, group) {
        if (items.length) {
          html = html.concat(this.renderItems(items, group));
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

      html.data('typeahead-multiple-value', item);

      return html[0];
    }, this);

    if (group) {
      var groupHtml = $(groupTemplate).find('[data-typeahead-group-title]').text(group).end();
      itemsHtml.splice(0, 0, groupHtml[0]);
    }

    return itemsHtml;
  },

  renderEmptyItem() {
    var that = this,
      emptyRenderer = this.options.emptyItem;

    return ($.isFunction(emptyRenderer) ?
      $(emptyRenderer.call(that)) :
      $(emptyRenderer)).data('typeahead-multiple-empty', true);
  },

  matcher: function(item) {
    var value = this.value(item);
    return value && value.toLowerCase().indexOf(this.query.toLowerCase()) >= 0;
  },

  value: function(item) {
    return item;
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
    this.$input
      .on('focus', $.proxy(this.focus, this))
      .on('blur', $.proxy(this.blur, this))
      .on('keypress', $.proxy(this.keypress, this))
      .on('keyup', $.proxy(this.keyup, this));

    if (this.options.filterInput) {
      this.$input.on('paste keypress drop', $.proxy(this._filterInput, this));
    }

    if (this.eventSupported('keydown')) {
      this.$input.on('keydown', $.proxy(this.keydown, this));
    }

    this.$menu
      .on('click', $.proxy(this.click, this))
      .on('mouseenter', 'li', $.proxy(this.mouseenter, this))
      .on('mouseleave', 'li', $.proxy(this.mouseleave, this));

    this.$element.on('click', '[data-remove="typeahead-value"]', $.proxy(this.onRemoveValue, this));
  },

  eventSupported: function(eventName) {
    var isSupported = eventName in this.$input;
    if (!isSupported) {
      this.$input.setAttribute(eventName, 'return;');
      isSupported = typeof this.$input[eventName] === 'function';
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

  _keyWasPressedForSaving: function(e) {
    return e.keyCode === KEYS.ENTER && !this.shown;
  },

  keydown: function(e) {
    this.suppressKeyPressRepeat = $.inArray(e.keyCode, [KEYS.DOWN_ARROW, KEYS.UP_ARROW, KEYS.ENTER, KEYS.ESCAPE]);
    if (!this._keyWasPressedForSaving(e)) {
      this.move(e);
    }

    if (e.keyCode === KEYS.BACKSPACE) {
      this.onInputBackspace();
    }
  },

  keypress: function(e) {
    if (this.suppressKeyPressRepeat || this._keyWasPressedForSaving(e)) {
      return;
    }
    this.move(e);
  },

  keyup: function(e) {
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
        this.lookup();
        this.updateInputWidth();
    }

    e.stopPropagation();
    e.preventDefault();
  },

  onInputBackspace: function() {
    var inputValue = this.$input.val();

    // remove the last item if no text typed
    if (!inputValue) {
      var values = this.$element.data('typeahead-values');
      values.pop();
      this._setValues(values);
    }
  },

  _filterInput: function(e) {
    if (e.which === 0 || e.which === 8 || e.ctrlKey || e.metaKey || this._keyWasPressedForSaving(e)) {
      return true;
    }

    var input = '';
    if (e.type === 'keypress') {
      input = String.fromCharCode(e.which);
    }
    else if (e.type === 'paste') {
      input = e.originalEvent.clipboardData.getData('text/plain');
    }
    else if (e.type === 'drop') {
      input = e.originalEvent.dataTransfer.getData('text/plain');
    }

    var prefixUpToSelection = this.$input.val().substr(0, this.$input[0].selectionStart);
    var postfixAfterSelection = this.$input.val().substr(this.$input[0].selectionEnd);
    var newValue = prefixUpToSelection + input + postfixAfterSelection;

    return this._isValidInput(newValue, input);
  },

  updateInputWidth: function() {
    let el = this.$input,
      elValue = el.val(),
      getTrickySpan = () => {
        let trickySpan = $('span[data-name="trickySpan"]');

        if (!trickySpan.length) {
          trickySpan = $('<span data-name="trickySpan"></span>');
          trickySpan.css({
            position: 'absolute',
            left: -9999,
            top: -9999,
            // ensure that the span has same font properties as the element
            'font-family': el.css('font-family'),
            'font-size': el.css('font-size'),
            'font-weight': el.css('font-weight'),
            'font-style': el.css('font-style')
          });
          $('body').append(trickySpan);
        }
        trickySpan.html(elValue);

        return trickySpan;
      },
      trickySpan = getTrickySpan();

    el.width(trickySpan.width() + 10);
  },

  focus: function() {
    this.focused = true;
    this.$element.addClass('focus');

    if (!this.mousedover) {
      this.lookup();
    }
  },

  blur: function() {
    this.abortRequest();
    this.$element.removeClass('focus');

    this.focused = false;
    if (!this.mousedover && this.shown) {
      this.hide();
    }
    if (!this.mousedover) {
      this.$element.trigger('typeahead-multiple:blur');
    }
    this.removeUnmatchedQuery();
  },

  click: function(e) {
    e.stopPropagation();
    e.preventDefault();

    // check selectable element is clicked
    if ($(e.target).parentsUntil(e.currentTarget, '.typeahead-not-selectable').length === 0) {
      this.select();
    } else {
      this.$input.focus();
    }
  },

  mouseenter: function(e) {
    this.mousedover = true;

    if (!$(e.currentTarget).hasClass('typeahead-not-selectable')) {
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

  onRemoveValue: function(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!this.$element.is('[disabled]') && !this.$element.is('.disabled')) {
      var $valueContainer = $(e.currentTarget).parents('.pill'),
        value = $valueContainer.data('typeahead-value'),
        index = $valueContainer.data('typeahead-index'),
        values = this.$element.data('typeahead-values');

      // to double check the appropriate value is being removed
      if (values[index] !== value) {
        index = values.indexOf(value);
      }
      values.splice(index, 1);

      this._setValues(values);
    }
  },

  request: function(params) {
    var complete = params.complete,
      success = params.success;

    if (this.focused) {
      this.$element.trigger('typeahead-multiple:request:start');

      this.xhr = $.ajax($.extend({
        dataType: 'json',
        contentType: 'application/json'
      }, _.omit(params, 'success', 'complete')));

      this.xhr
        .always((...args) => {
          this.$element.trigger('typeahead-multiple:request:complete');
          complete && complete.apply(this, args);
        })
        .done((...args) => {
          this.$element.trigger('typeahead-multiple:request:success');
          success && success.apply(this, args);
        });
    }
  },

  abortRequest: function() {
    if (this.xhr) {
      this.xhr.abort();

      this.$element.trigger('typeahead-multiple:request:complete');
    }
    return this;
  },

  removeUnmatchedQuery: function() {
    this.$input.val('');
    this.updateInputWidth();
  }

};

/* TYPEAHEAD MULTIPLE PLUGIN DEFINITION
 * =========================== */

var old = $.fn.typeaheadMultiple;

$.fn.typeaheadMultiple = function(option) {
  var rest = Array.prototype.slice.call(arguments, 1);
  return this.each(function() {
    var $this = $(this),
      data = $this.data('typeahead-multiple'),
      options = typeof option === 'object' && option;
    if (!data) {
      data = new TypeaheadMultiple(this, options);
      $this.data('typeahead-multiple', data);
    }
    if (typeof option === 'string') {
      data[option].apply(data, rest);
    }
  });
};

$.fn.typeaheadMultiple.defaults = {
  source: [],
  debounce: 150,
  autoselect: true,
  container: 'body',
  fitInputWidth: false,
  trimQuery: false,
  items: 5,
  values: [],
  menu: '<div class="typeahead dropdown-menu"><ul class="inline-block"></ul></div>',
  item: '<li><a href="#"></a></li>',
  group: '<li class="typeahead-group typeahead-not-selectable x--bb x--mh-s"><h4 data-typeahead-group-title class="x--mb-n"></h4></li>',
  minLength: 1
};

$.fn.typeaheadMultiple.Constructor = TypeaheadMultiple;

/* TYPEAHEAD NO CONFLICT
 * =================== */

$.fn.typeaheadMultiple.noConflict = function() {
  $.fn.typeaheadMultiple = old;
  return this;
};
