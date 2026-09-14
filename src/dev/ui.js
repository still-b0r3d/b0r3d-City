/* b0r3d-city dev menu -- small DOM helpers.
 *
 * Only ever loaded as part of the dev chunk (see src/devMode.js). Plain DOM rather
 * than jQuery so the menu's markup reads top to bottom in panel.js; ported from the
 * same helpers z0mbie crystal's dev menu uses.
 */

// h('div', {class: 'x', click: fn}, child, 'text', ...) -- function attributes become
// listeners, booleans become present/absent attributes, null/false children are skipped.
var h = function(tag, attrs) {
  var el = document.createElement(tag);
  attrs = attrs || {};

  Object.keys(attrs).forEach(function(key) {
    var value = attrs[key];
    if (typeof value === 'function')
      el.addEventListener(key, value);
    else if (typeof value === 'boolean') {
      if (value)
        el.setAttribute(key, '');
    } else if (value !== null && value !== undefined)
      el.setAttribute(key, value);
  });

  for (var i = 2; i < arguments.length; i++) {
    var child = arguments[i];
    if (child === null || child === undefined || child === false)
      continue;
    el.append(typeof child === 'string' || typeof child === 'number' ? document.createTextNode(String(child)) : child);
  }

  return el;
};


// Buttons hand focus straight back, so the game's own keys (arrows, WASD, Escape) keep
// working after a click instead of being eaten by a focused button.
var btn = function(label, onClick, cls, title) {
  var b = h('button', {type: 'button', class: ('dv-btn ' + (cls || '')).trim()}, label);
  if (title)
    b.title = title;

  b.addEventListener('click', function() {
    b.blur();
    onClick();
  });

  return b;
};


var num = function(value, attrs) {
  return h('input', Object.assign({type: 'number', class: 'dv-num', value: String(value)}, attrs || {}));
};


var text = function(value, attrs) {
  return h('input', Object.assign({type: 'text', class: 'dv-text', value: value}, attrs || {}));
};


var fillSel = function(select, options, value) {
  select.replaceChildren.apply(select, options.map(function(option) {
    var o = h('option', {value: option[0]}, option[1]);
    if (option[0] === value)
      o.selected = true;
    return o;
  }));
};


var sel = function(options, value) {
  var s = h('select', {class: 'dv-sel'});
  fillSel(s, options, value);
  return s;
};


var check = function(label, checked, onChange, title) {
  var box = h('input', {type: 'checkbox'});
  box.checked = !!checked;
  box.addEventListener('change', function() {
    box.blur();
    onChange(box.checked);
  });

  var l = h('label', {class: 'dv-check'}, box, label);
  if (title)
    l.title = title;
  l.input = box;
  return l;
};


var row = function() {
  var el = h('div', {class: 'dv-row'});
  for (var i = 0; i < arguments.length; i++)
    if (arguments[i])
      el.append(arguments[i]);
  return el;
};


var wrap = function() {
  var el = h('div', {class: 'dv-wrap'});
  for (var i = 0; i < arguments.length; i++)
    if (arguments[i])
      el.append(arguments[i]);
  return el;
};


var lbl = function(s) {
  return h('span', {class: 'dv-lbl'}, s);
};


var note = function(s) {
  return h('div', {class: 'dv-note'}, s);
};


var sub = function(s) {
  return h('div', {class: 'dv-sub'}, s);
};


var val = function(input) {
  return Number(input.value) || 0;
};


// localStorage can throw outright (site data blocked), so every read has a fallback and
// every write is allowed to fail quietly -- the menu just won't remember that setting.
var readJson = function(key, fallback) {
  try {
    var raw = window.localStorage.getItem(key);
    return raw ? Object.assign({}, fallback, JSON.parse(raw)) : Object.assign({}, fallback);
  } catch (e) {
    return Object.assign({}, fallback);
  }
};


var writeJson = function(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    // storage blocked
  }
};


var fmt = function(n) {
  if (typeof n !== 'number' || !isFinite(n))
    return String(n);
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};


export { h, btn, num, text, sel, fillSel, check, row, wrap, lbl, note, sub, val, readJson, writeJson, fmt };
