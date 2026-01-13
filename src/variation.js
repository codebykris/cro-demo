(function () {
  "use strict";

  /**
   * vm02 — Interview + QA notes (READ ME)
   * ------------------------------------
   * What this test does (in plain English):
   * - Adds two “online exclusive” tariffs into O2’s existing tariff grid (per selected capacity).
   * - Ensures those injected tariffs behave like native ones: they respond to the Data filter,
   *   show the correct price/benefits/offer CTA, and open the offer modal.
   * - Fixes layout gaps when filters hide cards by applying a safe flex-wrap layout to the tariff rows
   *   (NO moving of nodes, NO cloning of native cards, so Angular behaviour remains intact).
   *
   * Key engineering hurdles we overcame:
   * 1) SPA/Angular re-renders: the grid can rebuild at any time; we use a MutationObserver + idempotent injection.
   * 2) Filters: the site filter is driven by Angular state; we make injected cards filterable by writing a
   *    normalized allowance attribute and reading selected options from Material checkbox state.
   * 3) Accordions: cloned Angular components don’t carry Angular click handlers; we wire accordion toggling
   *    ONLY for injected cards (delegated capture handler so clicks on nested spans still work).
   * 4) Layout gaps: hiding cards in a float/grid system can leave holes; instead of risky DOM relayout,
   *    we apply flex-wrap styling to the rows that contain tariff cards (safe + reversible).
   * 5) Filter counts: we DO NOT globally recount (risk of huge numbers/duplicates). We only “+N” the injected cards
   *    onto O2’s existing counts and always derive from stored originals to avoid compounding.
   */

  const VARIANT_ID = "vm02-variation-v1";

  const INJECTED_COL_ATTR = "data-vm02-injected-col";
  const INJECTED_ROW_ATTR = "data-vm02-injected-cap";

  const MODAL_ID = "vm02-offer-modal";
  const MODAL_OVERLAY_ID = "vm02-offer-overlay";

  const FAIR_USAGE_URL =
    "https://www.o2.co.uk/termsandconditions/mobile/o2-consumer-fair-usage-policy";

  // Tariffs are table-driven; adjust only here if your source table changes.
  const TARIFFS = {
    "128GB": [
      { allowance: "100GB", upfront: 30.0, monthly: 38.31, device: 21.36, airtime: 16.95 },
      { allowance: "Unlimited", upfront: 30.0, monthly: 45.31, device: 21.36, airtime: 23.95 },
    ],
    "256GB": [
      { allowance: "75GB", upfront: 30.0, monthly: 48.0, device: 23.03, airtime: 24.97 },
      { allowance: "Unlimited", upfront: 30.0, monthly: 52.3, device: 23.03, airtime: 29.27 },
    ],
  };

  const OFFER_TITLE = "Get the Galaxy S25 for an exclusive low price. Ends 31 January.";
  const OFFER_PARAS = [
    "Data allowances must be used within the month and cannot be carried over, unless eligible for data rollover. Subject to availability. Ends 31 January 2026.",
    "UK calls/texts to standard UK landlines and mobiles and when roaming in our Europe Zone. Europe Zone data only. Fair usage policy applies. Special and out of bundle numbers chargeable.",
    "O2 Refresh custom plans: Direct purchases only. Pay the cash price for your device or spread the cost over 3 to 36 months (excludes dongles). The device cost will be the same whatever you choose. There may be an upfront cost.",
    "You can pay off your Device Plan at any time and choose to keep your Airtime Plan, upgrade it, or leave. If you are in the first 24 months of your Device Plan and you cancel your Airtime Plan you will have to pay the remainder of your Device Plan in full. After 24 months you can keep your Airtime Plan, upgrade it, or end it without affecting your Device Plan.",
    "UK data only. Fair Usage policy applies. Devices are subject to availability. 0% APR. Finance subject to status and credit checks. 18+. Direct Debit. Credit provided by Telefonica UK Ltd, RG2 6UU, UK. Telefonica UK is authorised and regulated by the FCA for consumer credit and insurance.",
  ];
  const OFFER_TERMS_URL = "https://www.o2.co.uk/termsandconditions";

  const log = (...a) => console.log(`[${VARIANT_ID}]`, ...a);

  // ---------- utils
  function money2(n) {
    return (Math.round(n * 100) / 100).toFixed(2);
  }
  function splitMoney(n) {
    const [i, d] = money2(n).split(".");
    return { i, d: "." + d };
  }
  function normAllowance(s) {
    return String(s || "")
      .replace(/\s+/g, "")
      .replace(/\.+$/, "")
      .toUpperCase();
  }

  function getSelectedCapacity() {
    const selected = document.querySelector(
      "o2uk-pills .o2uk-pills__button_selected .o2uk-pills__label"
    );
    const txt = selected ? selected.textContent.trim() : "";
    if (txt === "128GB" || txt === "256GB") return txt;

    const btn = document.querySelector("o2uk-pills .o2uk-pills__button_selected");
    const aria = btn ? btn.getAttribute("aria-label") || "" : "";
    if (aria.includes("128GB")) return "128GB";
    if (aria.includes("256GB")) return "256GB";
    return "128GB";
  }

  // ---------- CSS: flex-wrap row fix (safe, no DOM moves)
  function ensureFlexFixCSS() {
    if (document.getElementById("vm02-flexfix-style")) return;
    const style = document.createElement("style");
    style.id = "vm02-flexfix-style";
    style.textContent = `
      /* Pack visible cards tightly when some are display:none */
      .vm02-flex-row {
        display: flex !important;
        flex-wrap: wrap !important;
      }
      .vm02-flex-row:before,
      .vm02-flex-row:after {
        display: none !important;
        content: none !important;
      }
      /* Defensive: if legacy float layout exists, flex will override; avoid float weirdness */
      .vm02-flex-row > [class*="col-"] {
        float: none !important;
      }
    `;
    document.head.appendChild(style);
  }

  function applyFlexFixToTariffRows() {
    ensureFlexFixCSS();
    // Only target rows that actually contain tariff cards (keeps rest of page untouched)
    const rows = Array.from(document.querySelectorAll(".row")).filter((r) =>
      r.querySelector("o2uk-commercial-tariff-card.tariff-card")
    );
    rows.forEach((r) => r.classList.add("vm02-flex-row"));
  }

  // ---------- Modal (real nodes)
  function ensureOfferModal() {
    if (document.getElementById(MODAL_ID)) return;

    const overlay = document.createElement("div");
    overlay.id = MODAL_OVERLAY_ID;
    overlay.style.display = "none";

    const modal = document.createElement("div");
    modal.id = MODAL_ID;
    modal.style.display = "none";

    const header = document.createElement("div");
    header.className = "vm02-offer-modal__header";

    const title = document.createElement("div");
    title.className = "vm02-offer-modal__title";
    title.textContent = OFFER_TITLE;

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "vm02-offer-modal__close";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.textContent = "×";

    header.appendChild(title);
    header.appendChild(closeBtn);

    const body = document.createElement("div");
    body.className = "vm02-offer-modal__body";

    OFFER_PARAS.forEach((t) => {
      const p = document.createElement("p");
      p.textContent = t;
      body.appendChild(p);
    });

    const pTerms = document.createElement("p");
    pTerms.appendChild(document.createTextNode("Terms apply. "));
    const a = document.createElement("a");
    a.href = OFFER_TERMS_URL;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = "o2.co.uk/termsandconditions";
    pTerms.appendChild(a);
    body.appendChild(pTerms);

    modal.appendChild(header);
    modal.appendChild(body);

    document.body.appendChild(overlay);
    document.body.appendChild(modal);

    const close = () => {
      overlay.style.display = "none";
      modal.style.display = "none";
      document.documentElement.classList.remove("vm02-modal-open");
    };

    overlay.addEventListener("click", close);
    closeBtn.addEventListener("click", close);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close();
    });
  }

  function openOfferModal() {
    ensureOfferModal();
    const overlay = document.getElementById(MODAL_OVERLAY_ID);
    const modal = document.getElementById(MODAL_ID);
    if (!overlay || !modal) return;

    overlay.style.display = "block";
    modal.style.display = "block";
    document.documentElement.classList.add("vm02-modal-open");
  }

  // ---------- DOM anchors
  function findRowAndTemplate() {
    const card = document.querySelector("o2uk-commercial-tariff-card.tariff-card");
    if (!card) return null;

    const col =
      card.closest(".col-lg-4.col-md-4.col-sm-4.col-xs-4") || card.closest("[class*='col-']");
    if (!col) return null;

    const row = col.closest(".row") || col.parentElement;
    if (!row) return null;

    return { row, templateCol: col };
  }

  function removeInjected(row) {
    row.querySelectorAll(`[${INJECTED_COL_ATTR}="true"]`).forEach((n) => n.remove());
  }

  // Grab all tariff cols globally (for filter hide/show)
  function getAllTariffCols() {
    const cards = Array.from(document.querySelectorAll("o2uk-commercial-tariff-card.tariff-card"));
    const cols = [];
    cards.forEach((card) => {
      const col =
        card.closest(".col-lg-4.col-md-4.col-sm-4.col-xs-4") || card.closest("[class*='col-']");
      if (col) cols.push(col);
    });
    return cols;
  }

  // ---------- Card mutations
  function addOnlineExclusiveRoof(col) {
    const roof = col.querySelector(".tariff-card__roof");
    if (!roof || roof.querySelector(".vm02-online-exclusive")) return;

    const badge = document.createElement("div");
    badge.className = "vm02-online-exclusive";
    badge.textContent = "Online Exclusive";
    roof.appendChild(badge);
  }

  function setAllowance(col, allowance) {
    const span = col.querySelector(".new-tariff-card-plan-info__allowance > span");
    if (span) span.textContent = allowance;

    // Store normalized value for filtering
    col.setAttribute("data-vm02-allowance", normAllowance(allowance));

    const existing = col.querySelector(".new-tariff-card-plan-info__fair-usage-link");
    if (String(allowance).toLowerCase() === "unlimited") {
      if (!existing) {
        const wrap = document.createElement("div");
        wrap.className = "new-tariff-card-plan-info__fair-usage-link ng-star-inserted";
        wrap.innerHTML = `<a href="${FAIR_USAGE_URL}" target="_blank" rel="noopener">Fair usage applies<span class="sr-only" style="position:absolute !important;">&nbsp;Opens in new tab</span></a>`;
        const allowanceNode = col.querySelector(".new-tariff-card-plan-info__allowance");
        if (allowanceNode) allowanceNode.appendChild(wrap);
      }
    } else if (existing) {
      existing.remove();
    }
  }

  function setUpfront(col, upfront) {
    const { i, d } = splitMoney(upfront);
    const intNode = col.querySelector(
      ".new-tariff-price-block__prices_upfront .o2uk-price__amount-integer"
    );
    const decNode = col.querySelector(
      ".new-tariff-price-block__prices_upfront .o2uk-price__amount-decimal span"
    );
    const sr = col.querySelector(".new-tariff-price-block__prices_upfront .sr-only");
    if (intNode) intNode.textContent = i;
    if (decNode) decNode.textContent = d;
    if (sr) sr.textContent = ` £${money2(upfront)} UPFRONT `;
  }

  function setMonthly(col, monthly) {
    const { i, d } = splitMoney(monthly);
    const root = col.querySelector(".new-tariff-price-block__prices_monthly");
    if (!root) return;

    const intNode = root.querySelector(".o2uk-price__amount-integer");
    const decNode = root.querySelector(".o2uk-price__amount-decimal span");
    const sr = root.querySelector(".sr-only");
    if (intNode) intNode.textContent = ` ${i} `;
    if (decNode) decNode.textContent = ` ${d} `;
    if (sr) sr.textContent = ` £${money2(monthly)} monthly `;
  }

  function setRises(col, monthly) {
    const items = Array.from(
      col.querySelectorAll(".new-tariff-price-block__price-rise-container .price-rise-item")
    );
    const apr2026 = monthly + 2.5;
    const apr2027 = monthly + 5.0;

    if (items[0]) {
      const spans = items[0].querySelectorAll("span");
      if (spans[0]) spans[0].textContent = "From Apr 2026 bill";
      if (spans[1]) spans[1].textContent = `£${money2(apr2026)}`;
    }
    if (items[1]) {
      const spans = items[1].querySelectorAll("span");
      if (spans[0]) spans[0].textContent = "From Apr 2027 bill";
      if (spans[1]) spans[1].textContent = `£${money2(apr2027)}`;
    }
  }

  function setBreakdown(col, device, airtime) {
    const node = col.querySelector(".new-tariff-price-block__monthly-cost-amount > div");
    if (node) node.textContent = `£${money2(device)} Device + £${money2(airtime)} Airtime`;
  }

  // Spec: exactly 2 benefits (content only)
  function setBenefitsToTwo(col) {
    const label = col.querySelector(".o2uk-inline-accordion__text");
    if (label) label.textContent = " View (2) benefits ";

    const body = col.querySelector(".new-tariff-promo-block-benefits__container");
    if (!body) return;

    body.innerHTML = `
      <div class="new-tariff-promo-block-benefits__offer ng-star-inserted">
        <p>Roam freely in the EU, up to 25GB</p>
      </div>
      <div class="new-tariff-promo-block-benefits__offer ng-star-inserted">
        Unlimited UK Minutes &amp; texts
      </div>
    `;
  }

  function setOffer(col) {
    const title = col.querySelector(".new-tariff-promo-block-primary__section-title");
    if (title) title.textContent = "OFFER";

    const btn = col.querySelector(".new-tariff-promo-block-primary__container");
    if (!btn) return;

    // Replace just this node to remove existing handlers on cloned markup
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    newBtn.style.backgroundColor = "#953698";

    const titleDiv = col.querySelector(".new-tariff-promo-block-primary__title");
    if (titleDiv) {
      const icon = titleDiv.querySelector("span");
      titleDiv.textContent = "";
      if (icon) titleDiv.appendChild(icon);
      titleDiv.appendChild(document.createTextNode(" " + OFFER_TITLE));
    }

    newBtn.addEventListener("click", (e) => {
      e.preventDefault();
      openOfferModal();
    });
  }

  // ---------- Accordion (Injected only)
  function wireInjectedAccordion(col) {
    if (col.getAttribute("data-vm02-accordion-wired") === "true") return;

    const header =
      col.querySelector(".mat-expansion-panel-header") || col.querySelector("o2uk-expansion-panel-header");
    const panel =
      col.querySelector(".mat-expansion-panel") || col.querySelector("o2uk-expansion-panel");
    const content =
      col.querySelector(".mat-expansion-panel-content") || col.querySelector(".o2uk-expansion-panel-content");
    const label = col.querySelector(".o2uk-inline-accordion__text");
    const icon = col.querySelector(".o2uk-panel-icon.o2uk-expansion-indicator");

    if (!header || !content) return;

    header.setAttribute("role", "button");
    header.tabIndex = 0;

    function setState(open) {
      header.setAttribute("aria-expanded", open ? "true" : "false");
      header.classList.toggle("mat-expanded", open);
      if (panel) panel.classList.toggle("mat-expanded", open);

      // Let site CSS + your overflow fix do the rest
      content.style.display = open ? "block" : "none";
      content.setAttribute("aria-hidden", open ? "false" : "true");

      if (icon) icon.style.transform = open ? "rotate(180deg)" : "rotate(0deg)";
      if (label) label.textContent = open ? " Hide benefits " : " View (2) benefits ";
    }

    // Always start collapsed on injected cards
    setState(false);

    col.setAttribute("data-vm02-accordion-wired", "true");
  }

  // Delegated capture handler: reliable for clicks on nested spans/icons
  function onInjectedAccordionClick(e) {
    const header =
      e.target && e.target.closest
        ? e.target.closest(".mat-expansion-panel-header, o2uk-expansion-panel-header")
        : null;
    if (!header) return;

    const col = header.closest(`[${INJECTED_COL_ATTR}="true"]`);
    if (!col) return; // never touch native Angular cards

    wireInjectedAccordion(col);

    e.preventDefault();
    e.stopPropagation();

    const content =
      col.querySelector(".mat-expansion-panel-content") || col.querySelector(".o2uk-expansion-panel-content");
    if (!content) return;

    const openNow = header.getAttribute("aria-expanded") === "true";
    const open = !openNow;

    header.setAttribute("aria-expanded", open ? "true" : "false");
    header.classList.toggle("mat-expanded", open);

    const panel =
      col.querySelector(".mat-expansion-panel") || col.querySelector("o2uk-expansion-panel");
    if (panel) panel.classList.toggle("mat-expanded", open);

    content.style.display = open ? "block" : "none";
    content.setAttribute("aria-hidden", open ? "false" : "true");

    const label = col.querySelector(".o2uk-inline-accordion__text");
    if (label) label.textContent = open ? " Hide benefits " : " View (2) benefits ";

    const icon = col.querySelector(".o2uk-panel-icon.o2uk-expansion-indicator");
    if (icon) icon.style.transform = open ? "rotate(180deg)" : "rotate(0deg)";
  }

  function applyTariff(col, t) {
    addOnlineExclusiveRoof(col);
    setAllowance(col, t.allowance);
    setUpfront(col, t.upfront);
    setMonthly(col, t.monthly);
    setRises(col, t.monthly);
    setBreakdown(col, t.device, t.airtime);
    setOffer(col);
    setBenefitsToTwo(col);

    if (col.getAttribute(INJECTED_COL_ATTR) === "true") {
      wireInjectedAccordion(col);
    }

    const cta = col.querySelector("button.tariff-card__add-button");
    if (cta) cta.setAttribute("aria-label", `Choose this plan ${t.allowance} tariff plan`);
  }

  // ---------- Filters (stable)
  function getSelectedFilterAllowances() {
    const selected = new Set();

    const boxes = Array.from(
      document.querySelectorAll("o2uk-sort-and-filter-wrapper o2uk-checkbox.o2uk-checkbox")
    );

    boxes.forEach((box) => {
      if (!box.classList.contains("mat-checkbox-checked")) return;

      const p = box.querySelector(".o2uk-checkbox-label p");
      const raw = p ? p.textContent : "";
      const cleaned = raw.replace(/\(\s*\d+\s*\)/g, "").trim();
      if (!cleaned) return;

      selected.add(normAllowance(cleaned));
    });

    return selected;
  }

  function getColAllowance(col) {
    const attr = col.getAttribute("data-vm02-allowance");
    if (attr) return attr;

    const span = col.querySelector(".new-tariff-card-plan-info__allowance > span");
    return span ? normAllowance(span.textContent) : "";
  }

  function applyFiltersToCards() {
    const selected = getSelectedFilterAllowances();
    const cols = getAllTariffCols();
    if (!cols.length) return;

    if (!selected || selected.size === 0) {
      cols.forEach((col) => (col.style.display = ""));
      return;
    }

    cols.forEach((col) => {
      const a = getColAllowance(col);
      col.style.display = selected.has(a) ? "" : "none";
    });
  }

  // ---------- Filter counts (SAFE: only add injected cards)
  function getInjectedCountsByAllowance() {
    const counts = new Map();
    const injected = Array.from(document.querySelectorAll(`[${INJECTED_COL_ATTR}="true"]`));
    injected.forEach((col) => {
      const a = getColAllowance(col);
      if (!a) return;
      counts.set(a, (counts.get(a) || 0) + 1);
    });
    return counts;
  }

  function primeFilterLabelOriginals() {
    const boxes = Array.from(
      document.querySelectorAll("o2uk-sort-and-filter-wrapper o2uk-checkbox.o2uk-checkbox")
    );

    boxes.forEach((box) => {
      const p = box.querySelector(".o2uk-checkbox-label p");
      const input = box.querySelector("input.o2uk-checkbox-input");
      if (p && !p.hasAttribute("data-vm02-orig-text")) {
        p.setAttribute("data-vm02-orig-text", p.textContent || "");
      }
      if (input && !input.hasAttribute("data-vm02-orig-aria")) {
        input.setAttribute("data-vm02-orig-aria", input.getAttribute("aria-label") || "");
      }
    });
  }

  function patchFilterCountsAddInjected() {
    primeFilterLabelOriginals();

    const injectedCounts = getInjectedCountsByAllowance();
    if (!injectedCounts.size) return;

    const boxes = Array.from(
      document.querySelectorAll("o2uk-sort-and-filter-wrapper o2uk-checkbox.o2uk-checkbox")
    );

    boxes.forEach((box) => {
      const p = box.querySelector(".o2uk-checkbox-label p");
      const input = box.querySelector("input.o2uk-checkbox-input");
      if (!p) return;

      const orig = p.getAttribute("data-vm02-orig-text") || p.textContent || "";
      // orig example: "Unlimited (3)" or "200GB (2)"
      const m = orig.match(/^\s*([^(]+?)\s*(?:\(\s*(\d+)\s*\))?\s*$/);
      if (!m) return;

      const labelBase = (m[1] || "").trim();
      const siteN = parseInt(m[2] || "0", 10) || 0;

      const key = normAllowance(labelBase);
      const add = injectedCounts.get(key) || 0;
      if (!add) {
        // restore original (important when switching capacities)
        p.textContent = orig;
        if (input) {
          const oa = input.getAttribute("data-vm02-orig-aria") || input.getAttribute("aria-label") || "";
          if (oa) input.setAttribute("aria-label", oa);
        }
        return;
      }

      const nextN = siteN + add;
      p.textContent = ` ${labelBase} (${nextN}) `;

      // aria-label: keep O2’s phrase, just bump number if present
      if (input) {
        const origAria = input.getAttribute("data-vm02-orig-aria") || input.getAttribute("aria-label") || "";
        if (/Select filter by/i.test(origAria)) {
          const nextAria = origAria
            .replace(/(\.\s*)\d+\s+items?\s+found/i, `$1${nextN} items found`)
            .replace(/\.\s*\d+\s+items?\s+found/i, `. ${nextN} items found`);
          input.setAttribute("aria-label", nextAria);
        }
      }
    });
  }

  function applyFiltersCountsAndFlexFix() {
    applyFiltersToCards();
    patchFilterCountsAddInjected();
    applyFlexFixToTariffRows();
  }

  // ---------- Injection (idempotent per capacity)
  function inject(capacity) {
    const found = findRowAndTemplate();
    if (!found) return false;

    const { row, templateCol } = found;

    const alreadyForCap = row.getAttribute(INJECTED_ROW_ATTR) === capacity;
    const hasInjectedCols = !!row.querySelector(`[${INJECTED_COL_ATTR}="true"]`);
    if (alreadyForCap && hasInjectedCols) {
      applyFiltersCountsAndFlexFix();
      return true;
    }

    ensureOfferModal();
    removeInjected(row);

    const tariffs = TARIFFS[capacity] || TARIFFS["128GB"];

    tariffs.forEach((t) => {
      const clone = templateCol.cloneNode(true);
      clone.setAttribute(INJECTED_COL_ATTR, "true");
      clone.classList.add("vm02-injected-col");
      applyTariff(clone, t);
      row.insertBefore(clone, templateCol);
    });

    row.setAttribute(INJECTED_ROW_ATTR, capacity);

    applyFiltersCountsAndFlexFix();
    return true;
  }

  // ---------- Boot / resilience
  log("init");

  let lastCap = null;

  function refresh() {
    const cap = getSelectedCapacity();
    lastCap = cap;
    inject(cap);
  }

  // Initial polling: wait for Angular to render the first card
  let attempts = 0;
  const timer = setInterval(() => {
    attempts++;
    const ok = inject(getSelectedCapacity());
    if (ok || attempts > 40) clearInterval(timer); // ~10s max
  }, 250);

  // Capacity click -> refresh after UI updates
  document.addEventListener("click", (e) => {
    const btn =
      e.target && e.target.closest ? e.target.closest("o2uk-pills .o2uk-pills__button") : null;
    if (!btn) return;

    setTimeout(() => {
      const cap = getSelectedCapacity();
      if (cap !== lastCap) refresh();
      else inject(cap);
    }, 150);
  });

  // Filter changes -> apply (and force flex pack)
  function onFilterInteraction(e) {
    const inFilter =
      e.target && e.target.closest && e.target.closest("o2uk-sort-and-filter-wrapper o2uk-filter");
    if (!inFilter) return;

    setTimeout(() => {
      applyFiltersCountsAndFlexFix();
    }, 0);
  }
  document.addEventListener("click", onFilterInteraction, true);
  document.addEventListener("change", onFilterInteraction, true);

  // Injected accordion delegated handler
  document.addEventListener("click", onInjectedAccordionClick, true);

  // MutationObserver: debounce, but avoid loops
  let obs = null;
  let scheduled = false;
  let writing = false;

  function startObserver() {
    if (obs) obs.disconnect();
    obs = new MutationObserver(() => scheduleApply());
    obs.observe(document.documentElement, { childList: true, subtree: true });
  }

  function scheduleApply() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      applyFromObserver();
    });
  }

  function applyFromObserver() {
    if (writing) return;
    writing = true;
    if (obs) obs.disconnect();

    try {
      const cap = getSelectedCapacity();
      const found = findRowAndTemplate();
      if (!found) return;

      const { row } = found;
      const alreadyForCap = row.getAttribute(INJECTED_ROW_ATTR) === cap;
      const hasInjectedCols = !!row.querySelector(`[${INJECTED_COL_ATTR}="true"]`);

      if (!hasInjectedCols || !alreadyForCap) inject(cap);

      // Keep alignment + filter state stable after rerenders
      applyFiltersCountsAndFlexFix();

      // Re-wire injected accordions if DOM was swapped
      getAllTariffCols().forEach((col) => {
        if (col.getAttribute(INJECTED_COL_ATTR) === "true") wireInjectedAccordion(col);
      });
    } finally {
      writing = false;
      startObserver();
    }
  }

  startObserver();
})();
