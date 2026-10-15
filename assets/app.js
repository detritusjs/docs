(function () {
  'use strict';

  var base = document.body.getAttribute('data-base') || '/';
  var currentPackage = document.body.getAttribute('data-package') || '';

  function store(key, value) {
    try {
      if (value === undefined) {
        return window.localStorage.getItem(key);
      }
      window.localStorage.setItem(key, value);
    } catch (error) {}
    return null;
  }

  // ---------- mobile menu ----------
  var toggle = document.querySelector('.menu-toggle');
  var mobileNav = document.getElementById('mobile-nav');
  if (toggle && mobileNav) {
    toggle.addEventListener('click', function () {
      var open = mobileNav.hasAttribute('hidden');
      if (open) {
        mobileNav.removeAttribute('hidden');
      } else {
        mobileNav.setAttribute('hidden', '');
      }
      toggle.setAttribute('aria-expanded', String(open));
    });
  }

  // ---------- copy buttons ----------
  function copyText(text, button) {
    var done = function () {
      button.classList.add('is-copied');
      setTimeout(function () { button.classList.remove('is-copied'); }, 1200);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () {});
    } else {
      var area = document.createElement('textarea');
      area.value = text;
      document.body.appendChild(area);
      area.select();
      try { document.execCommand('copy'); done(); } catch (error) {}
      document.body.removeChild(area);
    }
  }

  document.addEventListener('click', function (event) {
    var button = event.target.closest('.copy-btn');
    if (!button) {
      return;
    }
    var source = button.getAttribute('data-copy');
    if (!source) {
      var block = button.closest('.code-block, .install');
      var code = block && block.querySelector('code');
      source = code ? code.textContent : '';
    }
    copyText(source, button);
  });

  // ---------- inherited / internal toggles ----------
  var toggleKeys = {inherited: 'detritus-docs:hide-inherited', internal: 'detritus-docs:show-internal'};
  var hideInherited = store(toggleKeys.inherited) === '1';
  var showInternal = store(toggleKeys.internal) === '1';
  document.body.classList.toggle('hide-inherited', hideInherited);
  document.body.classList.toggle('show-internal', showInternal);
  Array.prototype.forEach.call(document.querySelectorAll('[data-toggle]'), function (input) {
    var kind = input.getAttribute('data-toggle');
    input.checked = (kind === 'inherited') ? !hideInherited : showInternal;
    input.addEventListener('change', function () {
      if (kind === 'inherited') {
        document.body.classList.toggle('hide-inherited', !input.checked);
        store(toggleKeys.inherited, input.checked ? '0' : '1');
      } else {
        document.body.classList.toggle('show-internal', input.checked);
        store(toggleKeys.internal, input.checked ? '1' : '0');
      }
      syncToggles(kind, input.checked);
    });
  });
  function syncToggles(kind, checked) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-toggle="' + kind + '"]'), function (other) {
      other.checked = checked;
    });
  }

  // ---------- hash targets ----------
  function revealHash() {
    var previous = document.querySelectorAll('.is-target');
    Array.prototype.forEach.call(previous, function (node) { node.classList.remove('is-target'); });
    if (!location.hash) {
      return;
    }
    var target;
    try {
      target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    } catch (error) {
      return;
    }
    if (!target) {
      return;
    }
    // jumping to a hidden member turns its toggle back on
    if (target.classList.contains('is-internal') && !document.body.classList.contains('show-internal')) {
      document.body.classList.add('show-internal');
      syncToggles('internal', true);
    }
    if (target.classList.contains('is-inherited') && document.body.classList.contains('hide-inherited')) {
      document.body.classList.remove('hide-inherited');
      syncToggles('inherited', true);
    }
    if (target.matches('.row, .card, .param')) {
      target.classList.add('is-target');
    }
    target.scrollIntoView();
  }
  window.addEventListener('hashchange', revealHash);
  if (location.hash) {
    revealHash();
  }

  // ---------- sidebar scroll spy ----------
  var sideLinks = Array.prototype.slice.call(document.querySelectorAll('.docs-sidebar a.side-link[href^="#"]'));
  if (sideLinks.length) {
    var sidebar = document.querySelector('.docs-sidebar');
    var current = null;
    // targets in document order; hidden ones (toggled off members) are skipped
    var targets = sideLinks.map(function (link) {
      return {link: link, node: document.getElementById(link.getAttribute('href').slice(1))};
    }).filter(function (target) { return target.node; });

    var setActive = function (target) {
      if (target === current) {
        return;
      }
      if (current) {
        current.link.classList.remove('is-active');
      }
      current = target;
      if (!target) {
        return;
      }
      target.link.classList.add('is-active');
      if (sidebar && sidebar.scrollHeight > sidebar.clientHeight) {
        var linkBox = target.link.getBoundingClientRect();
        var sideBox = sidebar.getBoundingClientRect();
        if (linkBox.top < sideBox.top || linkBox.bottom > sideBox.bottom - 24) {
          sidebar.scrollTop += (linkBox.top - sideBox.top) - sidebar.clientHeight / 3;
        }
      }
    };

    // toggled-off members have no box, so search only the visible ones
    var visibleTargets = null;
    var getVisible = function () {
      if (!visibleTargets) {
        visibleTargets = targets.filter(function (target) { return target.node.getClientRects().length > 0; });
      }
      return visibleTargets;
    };
    document.addEventListener('change', function (event) {
      if (event.target.matches && event.target.matches('[data-toggle]')) {
        visibleTargets = null;
        schedule();
      }
    });

    var update = function () {
      var list = getVisible();
      var line = 200;
      // binary search for the last target whose top has scrolled past the line
      var low = 0;
      var high = list.length - 1;
      while (low <= high) {
        var mid = (low + high) >> 1;
        if (list[mid].node.getBoundingClientRect().top <= line) {
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }
      setActive(high >= 0 ? list[high] : null);
    };

    var queued = false;
    var schedule = function () {
      if (!queued) {
        queued = true;
        window.requestAnimationFrame(function () {
          queued = false;
          update();
        });
      }
    };
    window.addEventListener('scroll', schedule, {passive: true});
    window.addEventListener('resize', schedule);
    window.addEventListener('hashchange', function () {
      visibleTargets = null;
      schedule();
    });
    schedule();
  }

  // ---------- search ----------
  var KIND_ORDER = {class: 0, namespace: 1, interface: 2, enum: 3, function: 4, type: 5, variable: 6, method: 7, property: 8, accessor: 9, 'enum member': 10};
  var indexPromise = null;

  function loadIndex() {
    if (!indexPromise) {
      indexPromise = fetch(base + 'assets/search-index.json').then(function (response) {
        if (!response.ok) {
          throw new Error('search index missing');
        }
        return response.json();
      }).then(function (data) {
        // [name, kind, parent, pageIndex, packageIndex, anchor?]
        return data.items.map(function (item) {
          return {
            name: item[0],
            lower: item[0].toLowerCase(),
            kind: data.kinds[item[1]],
            parent: item[2],
            url: base + data.pages[item[3]] + (item[5] ? '#' + item[5] : ''),
            pkg: data.packages[item[4]],
          };
        });
      });
    }
    return indexPromise;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"]/g, function (c) {
      return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c];
    });
  }

  function score(item, query) {
    var index = item.lower.indexOf(query);
    if (index === -1) {
      return -1;
    }
    var value = 0;
    if (item.lower === query) {
      value += 1000;
    } else if (index === 0) {
      value += 500;
    } else if (item.name.charAt(index - 1) === '.' || item.name.charAt(index).toUpperCase() === item.name.charAt(index)) {
      value += 200;
    }
    value -= item.name.length;
    value -= (KIND_ORDER[item.kind] || 0) * 6;
    if (item.pkg.slug === currentPackage) {
      value += 120;
    }
    return value;
  }

  function highlightName(name, query) {
    var index = name.toLowerCase().indexOf(query);
    if (index === -1) {
      return escapeHtml(name);
    }
    return escapeHtml(name.slice(0, index)) + '<mark>' + escapeHtml(name.slice(index, index + query.length)) + '</mark>' + escapeHtml(name.slice(index + query.length));
  }

  Array.prototype.forEach.call(document.querySelectorAll('.search'), function (container) {
    var input = container.querySelector('.search-input');
    var panel = container.querySelector('.search-results');
    var results = [];
    var active = 0;

    function close() {
      panel.setAttribute('hidden', '');
      input.setAttribute('aria-expanded', 'false');
    }

    function render() {
      if (!results.length) {
        panel.innerHTML = '<div class="search-empty">No matches. Try a class, method or event name.</div>';
        return;
      }
      panel.innerHTML = results.map(function (result, index) {
        return '<a class="search-result' + (index === active ? ' is-active' : '') + '" role="option" href="' + result.item.url + '" data-index="' + index + '">' +
          '<span class="kind kind-' + result.item.kind.replace(' ', '-') + '">' + escapeHtml(result.item.kind) + '</span>' +
          '<span class="sr-name">' + highlightName(result.item.name, result.query) + '</span>' +
          (result.item.parent ? '<span class="sr-parent">' + escapeHtml(result.item.parent) + '</span>' : '') +
          '<span class="sr-pkg">' + escapeHtml(result.item.pkg.npm) + '</span>' +
          '</a>';
      }).join('');
      var current = panel.querySelector('.is-active');
      if (current) {
        current.scrollIntoView({block: 'nearest'});
      }
    }

    function run() {
      var query = input.value.trim().toLowerCase();
      if (!query) {
        results = [];
        close();
        return;
      }
      loadIndex().then(function (items) {
        if (input.value.trim().toLowerCase() !== query) {
          return;
        }
        var matches = [];
        for (var i = 0; i < items.length; i++) {
          var value = score(items[i], query);
          if (value > -Infinity && value !== -1 && items[i].lower.indexOf(query) !== -1) {
            matches.push({item: items[i], score: value, query: query});
          }
        }
        matches.sort(function (a, b) { return b.score - a.score; });
        results = matches.slice(0, 40);
        active = 0;
        panel.removeAttribute('hidden');
        input.setAttribute('aria-expanded', 'true');
        render();
      }, function () {
        panel.removeAttribute('hidden');
        panel.innerHTML = '<div class="search-empty">Search isn\'t available right now.</div>';
      });
    }

    input.addEventListener('focus', function () {
      loadIndex();
      if (input.value.trim()) {
        run();
      }
    });
    input.addEventListener('input', run);
    input.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        if (!results.length) {
          return;
        }
        event.preventDefault();
        active = (active + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
        render();
      } else if (event.key === 'Enter') {
        if (results[active]) {
          event.preventDefault();
          window.location.href = results[active].item.url;
        }
      } else if (event.key === 'Escape') {
        input.value = '';
        close();
        input.blur();
      }
    });
    document.addEventListener('click', function (event) {
      if (!container.contains(event.target)) {
        close();
      }
    });
  });

  // ---------- search palette ----------
  var palette = document.querySelector('.palette');
  function openPalette() {
    if (!palette) {
      return;
    }
    if (!palette.open) {
      if (palette.showModal) {
        palette.showModal();
      } else {
        palette.setAttribute('open', '');
      }
    }
    var input = palette.querySelector('.search-input');
    if (input) {
      input.focus();
      input.select();
    }
  }
  if (palette) {
    palette.addEventListener('click', function (event) {
      // clicking the backdrop closes it
      if (event.target === palette) {
        palette.close();
      }
    });
    palette.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && palette.open) {
        event.preventDefault();
        palette.close();
      }
    });
  }
  Array.prototype.forEach.call(document.querySelectorAll('[data-open-palette]'), function (button) {
    button.addEventListener('click', openPalette);
  });

  document.addEventListener('keydown', function (event) {
    if ((event.metaKey || event.ctrlKey) && (event.key === 'k' || event.key === 'K')) {
      event.preventDefault();
      openPalette();
      return;
    }
    if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    var tag = (document.activeElement && document.activeElement.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (document.activeElement && document.activeElement.isContentEditable)) {
      return;
    }
    event.preventDefault();
    // docs pages have a search box in their header, everywhere else gets the palette
    var inline = document.querySelector('.docs-hero .search-input');
    if (inline) {
      inline.focus();
    } else {
      openPalette();
    }
  });

  // ---------- packages dropdown ----------
  var menus = document.querySelectorAll('.nav-menu');
  document.addEventListener('click', function (event) {
    Array.prototype.forEach.call(menus, function (menu) {
      if (menu.open && !menu.contains(event.target)) {
        menu.open = false;
      }
    });
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      Array.prototype.forEach.call(menus, function (menu) { menu.open = false; });
    }
  });

  // ---------- tabs (installer, example window) ----------
  Array.prototype.forEach.call(document.querySelectorAll('[data-tabs]'), function (group) {
    var tabs = group.querySelectorAll('[data-tab]');
    var panels = group.querySelectorAll('[data-panel]');
    var select = function (index) {
      Array.prototype.forEach.call(tabs, function (tab) {
        tab.setAttribute('aria-selected', String(tab.getAttribute('data-tab') === index));
      });
      Array.prototype.forEach.call(panels, function (panel) {
        panel.hidden = panel.getAttribute('data-panel') !== index;
      });
    };
    Array.prototype.forEach.call(tabs, function (tab) {
      tab.addEventListener('click', function () { select(tab.getAttribute('data-tab')); });
    });
  });
})();
