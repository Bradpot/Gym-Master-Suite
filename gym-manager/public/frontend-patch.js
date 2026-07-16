(function () {
  "use strict";

  var FIELD_ROOT_ID = "gm-extra-member-fields";
  var DURATION_ROOT_ID = "gm-duration-scrollbar-root";
  var MEMBER_TYPE_ROOT_ID = "gm-member-type-root";
  var CSV_SIMPLE_FORMAT_TEXT =
    "Simple format: Full Name, Phone Number, Start Date, End Date, Payment Mode, Duration";
  var paymentByMemberId = {};
  var dashboardObserver = null;
  var dashboardDecorateTimer = null;
  var csvTemplateHandlerBound = false;
  var csvQuickUploadBound = false;
  var csvModalBound = false;
  var membershipTypeData = null;
  var membershipTypeSelected = "all";
  var navBootstrapObserver = null;
  var navBootstrapTimer = null;
  var memberFormObserver = null;
  var memberFormTimer = null;
  var memberFormBootstrapTimer = null;
  var membersDashboardVisibilityGuardBound = false;
  var membersDashboardVisibilityObserver = null;
  var routeTransitionTimer = null;
  var routeTransitionBootstrapped = false;
  var membershipRouteBootstrapped = false;
  var titleCaseFormatterBound = false;
  var MEMBERSHIP_TYPE_STORE_KEY = "gm.membershipType.records.v1";
  var MEMBERSHIP_TYPE_META_KEY = "gm.membershipType.meta.v1";
  var MEMBERSHIP_TYPE_UPDATED_EVENT = "gm:membership-types-updated";
  var CHATBOT_ROOT_ID = "gm-chatbot-root";
  var chatbotHistory = [];
  var LOGIN_BG_TOOL_ID = "gm-login-bg-tool";

  function normalizePath(pathname) {
    var raw = String(pathname || "/");
    raw = raw.replace(/\/{2,}/g, "/");
    if (raw.length > 1) raw = raw.replace(/\/+$/, "");
    return raw || "/";
  }

  function isMemberFormRoute(pathname) {
    var normalized = normalizePath(pathname);
    return /^\/members\/new$/.test(normalized) || /^\/members\/\d+\/edit$/.test(normalized);
  }

  function isMembersDashboardRoute(pathname) {
    return normalizePath(pathname) === "/members";
  }

  function isMembershipTypeRoute(pathname) {
    return /^\/membership-type(\/(add|list))?$/.test(normalizePath(pathname));
  }

  function membershipTypeMode(pathname) {
    var raw = String(pathname || "").replace(/\/+$/, "");
    if (raw === "/membership-type/list") return "add";
    if (raw === "/membership-type/add") return "add";
    if (raw === "/membership-type") return "add";
    return "add";
  }

  function isNewMemberRoute(pathname) {
    return normalizePath(pathname) === "/members/new";
  }

  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  function qsa(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function toTitleCaseValue(value) {
    var raw = String(value == null ? "" : value);
    if (!raw.trim()) return raw;
    return raw
      .toLowerCase()
      .replace(/\b([a-z])/g, function (_m, chr) {
        return chr.toUpperCase();
      });
  }

  function shouldApplyTitleCaseToField(field) {
    if (!field || !field.tagName) return false;
    if (field.readOnly || field.disabled) return false;
    if (field.getAttribute("data-gm-no-title-case") === "1") return false;
    if (!field.closest("main,#root,form,#gm-membership-type-view")) return false;
    // Never mutate input values on Members dashboard list page; only visual styling is allowed there.
    if (isMembersDashboardRoute(window.location.pathname)) return false;

    var tag = String(field.tagName).toUpperCase();
    if (tag !== "INPUT" && tag !== "TEXTAREA") return false;

    if (tag === "INPUT") {
      var type = String(field.type || "text").toLowerCase();
      var disallowed = {
        password: true,
        email: true,
        number: true,
        tel: true,
        date: true,
        datetime: true,
        "datetime-local": true,
        month: true,
        week: true,
        time: true,
        url: true,
        search: true,
        hidden: true,
      };
      if (disallowed[type]) return false;
    }

    if (isMembershipTypeRoute(window.location.pathname) && field.closest("#gm-membership-type-view")) {
      var fieldId = String(field.id || "").toLowerCase();
      if (fieldId !== "gm-mt-period") return true;
    }

    var identity = [
      field.name,
      field.id,
      field.placeholder,
      field.getAttribute("aria-label"),
      field.getAttribute("autocomplete"),
    ]
      .join(" ")
      .toLowerCase();

    // Keep contact/auth/assistant fields untouched.
    if (/(phone|mobile|contact|email|password|otp|pin|search|username|user\s*id|member\s*id|chatbot|assistant)/.test(identity)) return false;
    // Keep known numeric/business fields untouched.
    if (/(duration|month|day|period|amount|fee|price|payment|deposit|date|year)/.test(identity)) return false;

    return true;
  }

  function bindDashboardTitleCaseFormatter() {
    if (titleCaseFormatterBound) return;
    titleCaseFormatterBound = true;

    var formatField = function (field) {
      // Safety: never touch members list page while user types in search/filter controls.
      if (isMembersDashboardRoute(window.location.pathname)) return;
      if (!shouldApplyTitleCaseToField(field)) return;
      var before = String(field.value == null ? "" : field.value);
      var after = toTitleCaseValue(before);
      if (before === after) return;
      var start = field.selectionStart;
      var end = field.selectionEnd;
      field.value = after;
      if (typeof start === "number" && typeof end === "number" && field.setSelectionRange) {
        try {
          field.setSelectionRange(start, end);
        } catch (_err) {}
      }
    };

    document.addEventListener(
      "input",
      function (ev) {
        formatField(ev.target);
      },
      true
    );

    document.addEventListener(
      "blur",
      function (ev) {
        formatField(ev.target);
      },
      true
    );
  }

  function getMemberForm() {
    var forms = qsa("form");
    if (!forms.length) return null;

    for (var i = 0; i < forms.length; i += 1) {
      var form = forms[i];
      var hasName = !!qs('input[name="fullName"]', form);
      var hasPhone = !!qs('input[name="phoneNumber"]', form);
      var hasDuration = !!qs('input[name="membershipDurationMonths"]', form);
      if (hasName && hasPhone && hasDuration) return form;
    }

    for (var j = 0; j < forms.length; j += 1) {
      var candidate = forms[j];
      var text = String(candidate.textContent || "");
      var looksLikeMemberForm = /Create Member|Save Changes|Membership Period|Duration/i.test(text);
      if (looksLikeMemberForm && qs('input[name="membershipDurationMonths"]', candidate)) return candidate;
    }

    return null;
  }

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  function parseIsoInputDate(value) {
    var v = String(value || "").trim();
    var m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    var y = Number(m[1]);
    var mo = Number(m[2]);
    var d = Number(m[3]);
    if (!isFinite(y) || !isFinite(mo) || !isFinite(d)) return null;
    var dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
    return dt;
  }

  function toIsoInputDate(dateValue) {
    if (!dateValue || isNaN(dateValue.getTime())) return "";
    var y = dateValue.getFullYear();
    var m = String(dateValue.getMonth() + 1).padStart(2, "0");
    var d = String(dateValue.getDate()).padStart(2, "0");
    return String(y) + "-" + m + "-" + d;
  }

  function addMonthsKeepingDay(source, months) {
    var y = source.getFullYear();
    var mo = source.getMonth();
    var day = source.getDate();
    var total = mo + Number(months || 0);
    var nextY = y + Math.floor(total / 12);
    var nextM = ((total % 12) + 12) % 12;
    var lastDay = new Date(nextY, nextM + 1, 0).getDate();
    return new Date(nextY, nextM, Math.min(day, lastDay));
  }

  function addMembershipDurationDate(source, durationMonths) {
    var duration = Number(durationMonths || 0);
    if (!isFinite(duration) || duration <= 0) return null;
    var wholeMonths = Math.floor(duration);
    var hasHalfMonth = duration - wholeMonths >= 0.5;
    var end = addMonthsKeepingDay(source, wholeMonths);
    if (hasHalfMonth) end.setDate(end.getDate() + 15);
    return end;
  }

  function updateProjectedEndDateField() {
    var startInput = qs("#gm-date-joining");
    var endInput = qs("#gm-date-end");
    if (!endInput) return;
    var startDate = parseIsoInputDate(startInput && startInput.value);
    var periodInput = qs("#gm-member-mtype-period");
    var periodDays = Number((periodInput && periodInput.value) || 0);
    if (startDate && isFinite(periodDays) && periodDays > 0) {
      var exactEnd = new Date(startDate.getTime() + periodDays * 86400000);
      endInput.value = toIsoInputDate(exactEnd);
      return;
    }
    var hiddenDuration = qs("#gm-member-mtype-duration-months");
    var nativeDuration = getNativeDurationInput();
    var durationValue = hiddenDuration && hiddenDuration.value ? hiddenDuration.value : (nativeDuration && nativeDuration.value) || "";
    var duration = Number(durationValue || 0);
    if (!startDate || !isFinite(duration) || duration <= 0) {
      endInput.value = "";
      return;
    }
    var endDate = addMembershipDurationDate(startDate, duration);
    endInput.value = endDate ? toIsoInputDate(endDate) : "";
  }

  function getMemberIdFromPath(pathname) {
    var m = normalizePath(pathname).match(/^\/members\/(\d+)\/edit$/);
    return m ? m[1] : null;
  }

  function normalizePaymentMode(value) {
    return String(value || "").toLowerCase() === "online" ? "Online" : "Cash";
  }

  function rememberMembersPayload(data) {
    if (!data || !Array.isArray(data.members)) return;
    var next = {};
    var ordered = [];
    data.members.forEach(function (m) {
      if (!m || !m.memberId) return;
      var mode = normalizePaymentMode(m.paymentMode);
      var rowData = {
        memberId: String(m.memberId),
        paymentMode: mode,
        membershipDurationMonths: m.membershipDurationMonths,
        membershipStartDate: m.membershipStartDate,
        membershipEndDate: m.membershipEndDate,
      };
      next[String(m.memberId)] = rowData;
      ordered.push(rowData);
    });
    paymentByMemberId = { byId: next, ordered: ordered };
  }

  function renameStartDateLabel() {
    var form = getMemberForm();
    if (!form) return;
    var input = qs('input[name="membershipStartDate"]', form);
    if (!input) return;
    var container = input.closest("div");
    if (!container) return;
    var marker = qsa("label,span,p,div", container).find(function (el) {
      var txt = String(el.textContent || "").trim();
      return txt === "Membership Start Date" || txt === "Start Date" || txt === "Date of Joining";
    });
    if (marker) marker.textContent = "Start Date";
  }

  function hideMembershipStartDateForNewMember() {
    if (!isNewMemberRoute(window.location.pathname)) return;
    var form = getMemberForm();
    if (!form) return;
    var input = qs('input[name="membershipStartDate"]', form);
    if (!input) return;
    var container = input.closest("div");
    if (container) {
      container.style.display = "none";
    }
  }

  function ensureMembershipStartDateDefaultForNewMember() {
    if (!isNewMemberRoute(window.location.pathname)) return;
    var form = getMemberForm();
    if (!form) return;
    var input = qs('input[name="membershipStartDate"]', form);
    if (!input) return;
    if (String(input.value || "").trim()) return;
    input.value = todayIso();
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function syncCustomStartDateToNativeInput() {
    if (!isMemberFormRoute(window.location.pathname)) return;
    var form = getMemberForm();
    if (!form) return;
    var nativeStart = qs('input[name="membershipStartDate"]', form);
    if (!nativeStart) return;
    var joining = qs("#gm-date-joining");
    var nextValue = joining && joining.value ? String(joining.value) : String(nativeStart.value || "").trim();
    if (!nextValue) nextValue = todayIso();
    if (String(nativeStart.value || "") === nextValue) return;
    nativeStart.value = nextValue;
    nativeStart.dispatchEvent(new Event("input", { bubbles: true }));
    nativeStart.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function normalizeIndiaPhoneValue(value) {
    var raw = String(value == null ? "" : value).trim();
    if (!raw) return "+91 ";
    if (raw.indexOf("+91") === 0) return "+91 " + raw.slice(3).replace(/\D/g, "");
    if (raw.indexOf("91") === 0) return "+91 " + raw.slice(2).replace(/\D/g, "");
    if (raw.charAt(0) === "+") raw = raw.slice(1);
    return "+91 " + raw.replace(/\D/g, "");
  }

  function findPhoneNumberInput(form) {
    if (!form) return null;
    var direct = qs('input[name="phoneNumber"]', form);
    if (direct) return direct;
    return qsa("input", form).find(function (el) {
      var name = String(el.name || "").toLowerCase();
      var id = String(el.id || "").toLowerCase();
      var placeholder = String(el.placeholder || "").toLowerCase();
      return name.indexOf("phone") >= 0 || id.indexOf("phone") >= 0 || placeholder.indexOf("phone") >= 0;
    });
  }

  function ensureIndiaCountryCodeInPhoneField() {
    if (!isMemberFormRoute(window.location.pathname)) return;
    var form = getMemberForm();
    if (!form) return;
    var input = findPhoneNumberInput(form);
    if (!input) return;

    var normalized = normalizeIndiaPhoneValue(input.value);
    if (input.value !== normalized) input.value = normalized;
    input.placeholder = "+91 XXXXXXXXXX";

    if (input.getAttribute("data-gm-india-code-bound") === "1") return;
    input.setAttribute("data-gm-india-code-bound", "1");

    input.addEventListener("keydown", function (ev) {
      var start = input.selectionStart == null ? 0 : input.selectionStart;
      var end = input.selectionEnd == null ? 0 : input.selectionEnd;
      var deletingPrefix =
        (ev.key === "Backspace" && start <= 4 && end <= 4) || (ev.key === "Delete" && start < 4);
      if (deletingPrefix) ev.preventDefault();
    });

    input.addEventListener("input", function () {
      var next = normalizeIndiaPhoneValue(input.value);
      if (input.value !== next) input.value = next;
    });

    input.addEventListener("focus", function () {
      if (!input.value) input.value = "+91 ";
    });
  }

  function formatDurationLabel(value) {
    var v = Number(value || 1);
    if (v === 0.5) return "Half Month Offer (0.5 month)";
    if (v === 1.5) return "One and Half Month Offer (1.5 months)";
    if (v === 12) return "Yearly Offer (12 months)";
    return v + (v === 1 ? " Month Offer" : " Months Offer");
  }

  function membershipPlanNameFromMonths(monthsValue) {
    var v = Number(monthsValue || 0);
    if (!isFinite(v) || v <= 0) return "";
    if (v === 0.5) return "Half Month Plan";
    if (v === 12) return "Yearly Plan";
    if (v % 1 === 0) return String(v.toFixed(0)) + " Month Plan";
    return String(v.toFixed(1)) + " Month Plan";
  }

  function getPresetMembershipPlans() {
    var plans = [];
    for (var m = 0.5; m <= 12; m += 0.5) {
      var fixed = Number(m.toFixed(1));
      plans.push({
        key: "preset-" + String(fixed),
        name: membershipPlanNameFromMonths(fixed),
        periodDays: String(Math.round(fixed * 30)),
      });
    }
    return plans;
  }

  function findPresetByDays(daysValue) {
    var days = Number(daysValue);
    if (!isFinite(days) || days <= 0) return null;
    var plans = getPresetMembershipPlans();
    for (var i = 0; i < plans.length; i += 1) {
      if (Number(plans[i].periodDays) === days) return plans[i];
    }
    return null;
  }

  function getNativeDurationInput(form) {
    var root = form || getMemberForm();
    if (!root) return null;
    return qs('input[name="membershipDurationMonths"]', root);
  }

  function setNativeDurationValue(durationValue) {
    var native = getNativeDurationInput();
    if (!native) return;
    var next = Number(durationValue);
    if (!isFinite(next) || next <= 0) next = 1;
    // Keep the native React-controlled number field within its validation floor
    // (>=1 month), while the exact admin day-plan value is still sent by the
    // submit interceptor using membershipDurationDays.
    native.value = String(next < 1 ? 1 : next);
    native.dispatchEvent(new Event("input", { bubbles: true }));
    native.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function setDurationScrollbarValue(value) {
    var range = qs("#gm-duration-range");
    var hidden = qs("#gm-duration-input");
    var label = qs("#gm-duration-value");
    var next = Number(value || 1);
    if (!next || next < 0.5) next = 1;
    if (next > 12) next = 12;
    if (range) range.value = String(next);
    if (hidden) hidden.value = String(next);
    if (label) label.textContent = formatDurationLabel(next);
    setNativeDurationValue(next);
  }

  function setupDurationScrollbar() {
    if (!isMemberFormRoute(window.location.pathname)) return;
    var form = getMemberForm();
    if (!form) return;
    var existing = qs("#" + DURATION_ROOT_ID, form);
    if (existing) return;
    var misplaced = qs("#" + DURATION_ROOT_ID);
    if (misplaced && !form.contains(misplaced)) misplaced.remove();
    var nativeInput = getNativeDurationInput(form);
    if (!nativeInput) return;

    var nativeWrap = nativeInput.closest("div");
    if (nativeWrap) nativeWrap.style.display = "none";

    var membershipPeriodMarker = qsa("h1,h2,h3,legend,div,p,span", form).find(function (el) {
      return (el.textContent || "").trim() === "Membership Period";
    });
    if (membershipPeriodMarker) {
      var membershipPeriodBlock = membershipPeriodMarker.closest("section,div");
      if (membershipPeriodBlock) membershipPeriodBlock.style.display = "none";
    }

    var durationMarker = qsa("label,span,div,p", form).find(function (el) {
      return (el.textContent || "").trim() === "Duration";
    });
    if (durationMarker) {
      var durationBlock = durationMarker.closest("div");
      if (durationBlock) durationBlock.style.display = "none";
    }

    var defaultValue = Number(nativeInput.value || 1);
    if (!defaultValue || defaultValue < 0.5) defaultValue = 1;
    if (defaultValue > 12) defaultValue = 12;

    var card = document.createElement("section");
    card.id = DURATION_ROOT_ID;
    card.className = "rounded-2xl border bg-card p-6 space-y-4 gm-patch-enter";
    card.innerHTML =
      '<h2 class="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Membership Duration</h2>' +
      '<label class="gm-duration-label">Select Duration Offer</label>' +
      '<div class="gm-duration-value" id="gm-duration-value"></div>' +
      '<input id="gm-duration-range" type="range" min="0.5" max="12" step="0.5" />' +
      '<div class="gm-duration-scale"><span>0.5m</span><span>1.5m</span><span>3m</span><span>6m</span><span>12m</span></div>' +
      '<input id="gm-duration-input" type="hidden" value="' +
      String(defaultValue) +
      '" />';

    var paymentRoot = qs("#" + FIELD_ROOT_ID, form);
    var submitRow = qsa("div", form).find(function (d) {
      return /Create Member|Save Changes/i.test(d.textContent || "");
    });
    if (paymentRoot && paymentRoot.parentNode) paymentRoot.parentNode.insertBefore(card, paymentRoot);
    else if (submitRow && submitRow.parentNode) submitRow.parentNode.insertBefore(card, submitRow);
    else form.appendChild(card);

    var range = qs("#gm-duration-range");
    var hidden = qs("#gm-duration-input");
    var label = qs("#gm-duration-value");
    if (!range || !hidden || !label) return;
    range.value = String(defaultValue);
    hidden.value = String(defaultValue);
    label.textContent = formatDurationLabel(defaultValue);
    setNativeDurationValue(defaultValue);

    range.addEventListener("input", function () {
      hidden.value = String(range.value);
      label.textContent = formatDurationLabel(range.value);
      setNativeDurationValue(range.value);
    });
  }

  function periodDaysToDurationMonths(daysValue) {
    var days = Number(daysValue);
    if (!isFinite(days) || days <= 0) return 1;
    var halfMonths = Math.round(days / 15);
    if (halfMonths < 1) halfMonths = 1;
    return halfMonths / 2;
  }

  function durationMonthsToPeriodDays(monthsValue) {
    var months = Number(monthsValue || 0);
    if (!isFinite(months) || months <= 0) return "";
    return String(Math.round(months * 30));
  }

  function getCurrentMemberTypePeriodDays() {
    var typeSelect = qs("#gm-member-mtype-name");
    var selectedOption = typeSelect && typeSelect.options ? typeSelect.options[typeSelect.selectedIndex] : null;
    var fromOption = selectedOption ? Number(String(selectedOption.getAttribute("data-period-days") || "").trim()) : 0;
    if (isFinite(fromOption) && fromOption > 0) return Math.round(fromOption);
    var periodInput = qs("#gm-member-mtype-period");
    var fromInput = Number((periodInput && periodInput.value) || 0);
    if (isFinite(fromInput) && fromInput > 0) return Math.round(fromInput);
    return 0;
  }

  function syncMemberTypeFieldsFromDuration(monthsValue) {
    var typeSelect = qs("#gm-member-mtype-name");
    var periodInput = qs("#gm-member-mtype-period");
    var durationHidden = qs("#gm-member-mtype-duration-months");
    var periodDays = durationMonthsToPeriodDays(monthsValue);
    var months = Number(monthsValue || 0);
    if (!typeSelect || !periodInput || !durationHidden || !periodDays || !isFinite(months) || months <= 0) return;

    periodInput.value = periodDays;
    durationHidden.value = String(months);
    setNativeDurationValue(months);

    var matched = null;
    for (var i = 0; i < typeSelect.options.length; i += 1) {
      if (String(typeSelect.options[i].getAttribute("data-period-days") || "") === periodDays) {
        matched = typeSelect.options[i];
        break;
      }
    }
    if (matched) {
      typeSelect.value = matched.value;
      updateProjectedEndDateField();
      return;
    }

    var customOption = qs('option[value="custom-days"]', typeSelect);
    if (!customOption) {
      customOption = document.createElement("option");
      customOption.value = "custom-days";
      typeSelect.appendChild(customOption);
    }
    customOption.textContent = String(periodDays) + " Days Plan";
    customOption.setAttribute("data-plan-name", customOption.textContent);
    customOption.setAttribute("data-period-days", periodDays);
    typeSelect.value = customOption.value;
    updateProjectedEndDateField();
  }

  function setupMembershipTypeFieldsForMemberForm() {
    if (!isMemberFormRoute(window.location.pathname)) return;
    var form = getMemberForm();
    if (!form) return;
    var existing = qs("#" + MEMBER_TYPE_ROOT_ID, form);
    if (existing) {
      var existingTypeSelect = qs("#gm-member-mtype-name", existing) || qs("#gm-member-mtype-name", form);
      var existingPeriodInput = qs("#gm-member-mtype-period", existing) || qs("#gm-member-mtype-period", form);
      rebuildMemberTypeSelectOptions(existingTypeSelect, existingPeriodInput && existingPeriodInput.value);
      if (existingTypeSelect && !existingTypeSelect.value) {
        var firstSavedOption = qsa("option", existingTypeSelect).find(function (option) {
          return String(option.getAttribute("data-period-days") || "").trim().length > 0;
        });
        if (firstSavedOption) existingTypeSelect.value = firstSavedOption.value;
      }
      if (existingTypeSelect) existingTypeSelect.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }
    var misplaced = qs("#" + MEMBER_TYPE_ROOT_ID);
    if (misplaced && !form.contains(misplaced)) misplaced.remove();
    var nativeInput = getNativeDurationInput(form);
    if (!nativeInput) return;

    var nativeWrap = nativeInput.closest("div");
    if (nativeWrap) nativeWrap.style.display = "none";

    var membershipPeriodMarker = qsa("h1,h2,h3,legend,div,p,span", form).find(function (el) {
      return (el.textContent || "").trim() === "Membership Period";
    });
    if (membershipPeriodMarker) {
      var membershipPeriodBlock = membershipPeriodMarker.closest("section,div");
      if (membershipPeriodBlock) membershipPeriodBlock.style.display = "none";
    }

    var durationMarker = qsa("label,span,div,p", form).find(function (el) {
      return (el.textContent || "").trim() === "Duration";
    });
    if (durationMarker) {
      var durationBlock = durationMarker.closest("div");
      if (durationBlock) durationBlock.style.display = "none";
    }

    var card = document.createElement("section");
    card.id = MEMBER_TYPE_ROOT_ID;
    card.className = "rounded-2xl border bg-card p-6 space-y-4 gm-patch-enter gm-mt-fade-up";
    card.innerHTML =
      '<h2 class="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Membership Type</h2>' +
      '<div class="grid sm:grid-cols-2 gap-4">' +
      '<label class="flex flex-col gap-1.5 text-sm">Membership Type Name' +
      '<div id="gm-member-mtype-shell" class="gm-mtype-shell">' +
      '<select id="gm-member-mtype-name" class="h-11 rounded-xl border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 gm-member-mtype-select gm-mtype-native">' +
      '<option value="">Select Membership Type</option>' +
      "</select>" +
      '<button type="button" id="gm-member-mtype-trigger" class="gm-mtype-trigger"><span id="gm-member-mtype-trigger-label">Select Membership Type</span><span class="gm-mtype-caret" aria-hidden="true"></span></button>' +
      '<div id="gm-member-mtype-menu" class="gm-mtype-menu gm-mt-hidden" role="listbox" aria-label="Membership Type options"></div>' +
      "</div>" +
      "</label>" +
      '<label class="flex flex-col gap-1.5 text-sm">Membership Type Period' +
      '<input id="gm-member-mtype-period" type="text" inputmode="numeric" placeholder="No. of Days (45)" class="h-11 rounded-xl border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 gm-member-mtype-input" />' +
      "</label>" +
      "</div>" +
      '<input id="gm-member-mtype-duration-months" type="hidden" value="1" />';

    var paymentRoot = qs("#" + FIELD_ROOT_ID, form);
    var submitRow = qsa("div", form).find(function (d) {
      return /Create Member|Save Changes/i.test(d.textContent || "");
    });
    if (paymentRoot && paymentRoot.parentNode) paymentRoot.parentNode.insertBefore(card, paymentRoot);
    else if (submitRow && submitRow.parentNode) submitRow.parentNode.insertBefore(card, submitRow);
    else form.appendChild(card);

    var typeSelect = qs("#gm-member-mtype-name");
    var typeShell = qs("#gm-member-mtype-shell");
    var typeTrigger = qs("#gm-member-mtype-trigger");
    var typeTriggerLabel = qs("#gm-member-mtype-trigger-label");
    var typeMenu = qs("#gm-member-mtype-menu");
    var periodInput = qs("#gm-member-mtype-period");
    var durationHidden = qs("#gm-member-mtype-duration-months");
    rebuildMemberTypeSelectOptions(typeSelect, periodInput && periodInput.value);

    function setupCustomMemberTypeDropdown() {
      if (!typeSelect || !typeShell || !typeTrigger || !typeTriggerLabel || !typeMenu) return function () {};
      if (typeShell.getAttribute("data-bound") === "1") return function () {};
      typeShell.setAttribute("data-bound", "1");

      function selectedLabel() {
        var selectedOption = typeSelect.options && typeSelect.options[typeSelect.selectedIndex];
        if (!selectedOption || !String(typeSelect.value || "").trim()) return "Select Membership Type";
        return String(selectedOption.textContent || "").trim() || "Select Membership Type";
      }

      function updateTriggerLabel() {
        typeTriggerLabel.textContent = selectedLabel();
        typeTrigger.classList.toggle("gm-mtype-trigger-placeholder", !String(typeSelect.value || "").trim());
      }

      function closeMenu() {
        typeShell.classList.remove("gm-open");
        typeTrigger.setAttribute("aria-expanded", "false");
        typeMenu.classList.add("gm-mt-hidden");
      }

      function renderMenu() {
        if (!typeMenu) return;
        var html = ['<button type="button" class="gm-mtype-item gm-mtype-item-placeholder" data-mtype-value="">Select Membership Type</button>'];
        qsa("option", typeSelect).forEach(function (option) {
          var value = String(option.value || "").trim();
          if (!value) return;
          html.push(
            '<button type="button" class="gm-mtype-item' +
              (typeSelect.value === value ? " gm-active" : "") +
              '" data-mtype-value="' +
              escapeHtml(value) +
              '">' +
              escapeHtml(String(option.textContent || "").trim()) +
              "</button>"
          );
        });
        typeMenu.innerHTML = html.join("");
      }

      function openMenu() {
        rebuildMemberTypeSelectOptions(typeSelect, periodInput && periodInput.value);
        renderMenu();
        updateTriggerLabel();
        typeShell.classList.add("gm-open");
        typeTrigger.setAttribute("aria-expanded", "true");
        typeMenu.classList.remove("gm-mt-hidden");
      }

      function toggleMenu() {
        if (typeShell.classList.contains("gm-open")) closeMenu();
        else openMenu();
      }

      var onTriggerClick = function () {
        toggleMenu();
      };
      var onMenuClick = function (ev) {
        var btn = ev.target && ev.target.closest ? ev.target.closest("[data-mtype-value]") : null;
        if (!btn) return;
        var value = String(btn.getAttribute("data-mtype-value") || "");
        typeSelect.value = value;
        typeSelect.dispatchEvent(new Event("change", { bubbles: true }));
        closeMenu();
      };
      var onDocClick = function (ev) {
        if (!typeShell.contains(ev.target)) closeMenu();
      };
      var onDocKeyDown = function (ev) {
        if (ev.key === "Escape") closeMenu();
      };
      var onSelectChange = function () {
        updateTriggerLabel();
        renderMenu();
      };

      typeTrigger.addEventListener("click", onTriggerClick);
      typeMenu.addEventListener("click", onMenuClick);
      document.addEventListener("click", onDocClick);
      document.addEventListener("keydown", onDocKeyDown);
      typeSelect.addEventListener("change", onSelectChange);
      updateTriggerLabel();

      return function () {
        typeTrigger.removeEventListener("click", onTriggerClick);
        typeMenu.removeEventListener("click", onMenuClick);
        document.removeEventListener("click", onDocClick);
        document.removeEventListener("keydown", onDocKeyDown);
        typeSelect.removeEventListener("change", onSelectChange);
      };
    }

    setupCustomMemberTypeDropdown();

    function ensureCustomTypeOption(daysVal) {
      if (!typeSelect) return null;
      var option = qs('option[value="custom-days"]', typeSelect);
      if (!option) {
        option = document.createElement("option");
        option.value = "custom-days";
        typeSelect.appendChild(option);
      }
      option.textContent = String(daysVal) + " Days Plan";
      option.setAttribute("data-plan-name", option.textContent);
      option.setAttribute("data-period-days", String(daysVal));
      return option;
    }

    function syncFromSelectedType() {
      var selectedOption = typeSelect && typeSelect.options ? typeSelect.options[typeSelect.selectedIndex] : null;
      var periodDays = selectedOption ? String(selectedOption.getAttribute("data-period-days") || "").trim() : "";
      if (periodInput) periodInput.value = periodDays;
      var periodDaysNum = Number(periodDays || 0);
      // Keep native duration at >=1 month; exact day plan is carried in membershipDurationDays.
      var durationMonths = periodDays ? Math.max(1, periodDaysToDurationMonths(periodDaysNum)) : 1;
      if (durationHidden) durationHidden.value = String(durationMonths);
      setNativeDurationValue(durationMonths);
      updateProjectedEndDateField();
    }

    function syncTypeFromPeriod() {
      if (!typeSelect || !periodInput) return;
      periodInput.value = periodInput.value.replace(/[^\d]/g, "");
      var daysVal = Number(periodInput.value || 0);
      if (!isFinite(daysVal) || daysVal <= 0) {
        if (typeSelect.value === "custom-days") typeSelect.value = "";
        if (durationHidden) durationHidden.value = "1";
        setNativeDurationValue(1);
        return;
      }
      var matched = null;
      for (var i = 0; i < typeSelect.options.length; i += 1) {
        if (String(typeSelect.options[i].getAttribute("data-period-days") || "") === String(daysVal)) {
          matched = typeSelect.options[i];
          break;
        }
      }
      if (matched) {
        typeSelect.value = matched.value;
      } else {
        var customOption = ensureCustomTypeOption(daysVal);
        if (customOption) typeSelect.value = customOption.value;
      }
      // Keep native duration at >=1 month; exact day plan is carried in membershipDurationDays.
      var durationMonths = Math.max(1, periodDaysToDurationMonths(daysVal));
      if (durationHidden) durationHidden.value = String(durationMonths);
      setNativeDurationValue(durationMonths);
      typeSelect.dispatchEvent(new Event("change", { bubbles: true }));
      updateProjectedEndDateField();
    }

    if (typeSelect) {
      typeSelect.addEventListener("focus", function () {
        rebuildMemberTypeSelectOptions(typeSelect, periodInput && periodInput.value);
      });
      typeSelect.addEventListener("change", syncFromSelectedType);
    }
    if (periodInput) {
      periodInput.addEventListener("input", syncTypeFromPeriod);
      periodInput.addEventListener("change", syncTypeFromPeriod);
    }
    var joiningInput = qs("#gm-date-joining");
    if (joiningInput) {
      joiningInput.addEventListener("input", function () {
        syncCustomStartDateToNativeInput();
        updateProjectedEndDateField();
      });
      joiningInput.addEventListener("change", function () {
        syncCustomStartDateToNativeInput();
        updateProjectedEndDateField();
      });
    }
    syncTypeFromPeriod();
    if (!periodInput || !periodInput.value) syncFromSelectedType();
    updateProjectedEndDateField();

    if (card.getAttribute("data-gm-mtype-refresh-bound") !== "1") {
      card.setAttribute("data-gm-mtype-refresh-bound", "1");
      window.addEventListener(MEMBERSHIP_TYPE_UPDATED_EVENT, function () {
        rebuildMemberTypeSelectOptions(typeSelect, periodInput && periodInput.value);
        typeSelect.dispatchEvent(new Event("change", { bubbles: true }));
      });
    }

  }

  function setPaymentMode(value) {
    var hidden = qs("#gm-payment-mode");
    var buttons = qsa("#gm-payment-mode-buttons .gm-pay-btn");
    if (!hidden || buttons.length === 0) return;
    var selected = value === "online" ? "online" : "cash";
    hidden.value = selected;
    buttons.forEach(function (btn) {
      var active = btn.getAttribute("data-value") === selected;
      btn.classList.toggle("bg-primary", active);
      btn.classList.toggle("text-primary-foreground", active);
      btn.classList.toggle("border-primary", active);
      btn.classList.toggle("shadow-sm", active);
      btn.classList.toggle("bg-background", !active);
      btn.classList.toggle("text-foreground", !active);
      btn.classList.toggle("border-input", !active);
    });
  }

  function bindPaymentButtons() {
    var wrap = qs("#gm-payment-mode-buttons");
    if (!wrap || wrap.getAttribute("data-bound") === "1") return;
    wrap.setAttribute("data-bound", "1");
    wrap.addEventListener("click", function (ev) {
      var btn = ev.target.closest(".gm-pay-btn");
      if (!btn) return;
      setPaymentMode(btn.getAttribute("data-value") || "cash");
    });
    setPaymentMode((qs("#gm-payment-mode") && qs("#gm-payment-mode").value) || "cash");
  }

  function showMemberCreateFallbackMessage(message, isError) {
    var form = getMemberForm();
    if (!form) return;
    var submitRow = qsa("div", form).find(function (d) {
      return /Create Member|Save Changes/i.test(d.textContent || "");
    });
    var host = submitRow && submitRow.parentNode ? submitRow.parentNode : form;
    if (!host) return;
    var msg = qs("#gm-member-create-fallback-msg", host);
    if (!msg) {
      msg = document.createElement("div");
      msg.id = "gm-member-create-fallback-msg";
      msg.style.marginTop = "8px";
      msg.style.fontSize = "12px";
      host.appendChild(msg);
    }
    msg.textContent = message || "";
    msg.style.color = isError ? "#ef4444" : "#0ea5e9";
  }

  function bindCreateMemberFallbackSubmit() {
    if (!isNewMemberRoute(window.location.pathname)) return;
    var form = getMemberForm();
    if (!form || form.getAttribute("data-gm-create-fallback-bound") === "1") return;
    form.setAttribute("data-gm-create-fallback-bound", "1");

    form.addEventListener(
      "submit",
      function (ev) {
        if (!isNewMemberRoute(window.location.pathname)) return;

        var startPickerButton = qsa("button", form).find(function (btn) {
          return /^pick a date$/i.test(String(btn.textContent || "").trim());
        });
        if (!startPickerButton) return; // normal path should work when start date is selected.

        var fullNameInput = qs('input[name="fullName"]', form);
        var phoneInput = qs('input[name="phoneNumber"]', form);
        var fullName = fullNameInput ? String(fullNameInput.value || "").trim() : "";
        var phoneNumber = phoneInput ? String(phoneInput.value || "").trim() : "";
        if (!fullName || !phoneNumber) return;

        ev.preventDefault();
        ev.stopPropagation();
        if (typeof ev.stopImmediatePropagation === "function") ev.stopImmediatePropagation();

        var joining = qs("#gm-date-joining");
        var payment = qs("#gm-payment-mode");
        var paymentReceived = qs("#gm-payment-received");
        var deposit = qs("#gm-deposit-date");
        var durationInput = qs("#gm-duration-input");
        var typeDurationInput = qs("#gm-member-mtype-duration-months");
        var periodInput = qs("#gm-member-mtype-period");
        var profileFileInput = qsa('input[type="file"]', form).find(function (el) {
          return (el.files && el.files.length > 0) || /photo/i.test(String(el.name || "") + " " + String(el.id || ""));
        });

        var startDate = joining && joining.value ? String(joining.value) : todayIso();
        var duration =
          (typeDurationInput && typeDurationInput.value) ||
          (durationInput && durationInput.value) ||
          "1";
        var durationDays = getCurrentMemberTypePeriodDays();

        var body = new FormData();
        body.set("fullName", fullName);
        body.set("phoneNumber", phoneNumber);
        body.set("membershipStartDate", startDate);
        body.set("dateOfJoining", startDate);
        body.set("membershipDurationMonths", String(duration));
        if (isFinite(durationDays) && durationDays > 0) body.set("membershipDurationDays", String(Math.round(durationDays)));
        body.set("paymentMode", payment && payment.value ? String(payment.value) : "cash");
        body.set("paymentReceived", paymentReceived && paymentReceived.value ? String(paymentReceived.value) : "0");
        if (deposit && deposit.value) body.set("depositDate", String(deposit.value));
        if (profileFileInput && profileFileInput.files && profileFileInput.files[0]) {
          body.set("profilePhoto", profileFileInput.files[0]);
        }

        showMemberCreateFallbackMessage("Creating member...", false);
        fetch("/api/members", {
          method: "POST",
          body: body,
          credentials: "same-origin",
        })
          .then(function (resp) {
            return resp
              .json()
              .catch(function () {
                return {};
              })
              .then(function (data) {
                return { ok: resp.ok, data: data };
              });
          })
          .then(function (result) {
            if (!result.ok) {
              var err = (result.data && (result.data.error || result.data.message)) || "Failed to create member";
              throw new Error(err);
            }
            showMemberCreateFallbackMessage("Member created successfully. Redirecting...", false);
            setTimeout(function () {
              window.location.href = "/members";
            }, 220);
          })
          .catch(function (err) {
            showMemberCreateFallbackMessage(err && err.message ? err.message : "Failed to create member", true);
          });
      },
      true
    );
  }

  function showMemberEditFallbackMessage(message, isError) {
    var form = getMemberForm();
    if (!form) return;
    var submitRow = qsa("div", form).find(function (d) {
      return /Save Changes|Create Member/i.test(d.textContent || "");
    });
    var host = submitRow && submitRow.parentNode ? submitRow.parentNode : form;
    if (!host) return;
    var msg = qs("#gm-member-edit-fallback-msg", host);
    if (!msg) {
      msg = document.createElement("div");
      msg.id = "gm-member-edit-fallback-msg";
      msg.style.marginTop = "8px";
      msg.style.fontSize = "12px";
      host.appendChild(msg);
    }
    msg.textContent = message || "";
    msg.style.color = isError ? "#ef4444" : "#0ea5e9";
  }

  function bindEditMemberFallbackSubmit() {
    if (!isMemberFormRoute(window.location.pathname) || isNewMemberRoute(window.location.pathname)) return;
    var form = getMemberForm();
    if (!form || form.getAttribute("data-gm-edit-fallback-bound") === "1") return;
    form.setAttribute("data-gm-edit-fallback-bound", "1");

    form.addEventListener(
      "submit",
      function (ev) {
        if (!isMemberFormRoute(window.location.pathname) || isNewMemberRoute(window.location.pathname)) return;
        var memberId = getMemberIdFromPath(window.location.pathname);
        if (!memberId) return;

        // Upstream form validation requires integer months; this catches fractional plans like 0.5.
        var nativeDuration = getNativeDurationInput();
        var nativeDurationValue = nativeDuration ? Number(nativeDuration.value) : NaN;
        var customDuration = qs("#gm-member-mtype-duration-months");
        var customDurationValue = customDuration ? Number(customDuration.value) : NaN;
        var effectiveDuration = isFinite(customDurationValue) && customDurationValue > 0 ? customDurationValue : nativeDurationValue;
        if (!(isFinite(effectiveDuration) && effectiveDuration > 0 && effectiveDuration < 1)) return;

        var fullNameInput = qs('input[name="fullName"]', form);
        var phoneInput = qs('input[name="phoneNumber"]', form);
        var fullName = fullNameInput ? String(fullNameInput.value || "").trim() : "";
        var phoneNumber = phoneInput ? String(phoneInput.value || "").trim() : "";
        if (!fullName || !phoneNumber) return;

        ev.preventDefault();
        ev.stopPropagation();
        if (typeof ev.stopImmediatePropagation === "function") ev.stopImmediatePropagation();

        var joining = qs("#gm-date-joining");
        var payment = qs("#gm-payment-mode");
        var paymentReceived = qs("#gm-payment-received");
        var deposit = qs("#gm-deposit-date");
        var periodDays = getCurrentMemberTypePeriodDays();
        var profileFileInput = qsa('input[type="file"]', form).find(function (el) {
          return el.files && el.files.length > 0;
        });
        var nativeStartDateInput = qs('input[name="membershipStartDate"]', form);
        var startDate =
          (joining && joining.value) ||
          (nativeStartDateInput && nativeStartDateInput.value) ||
          todayIso();

        var body = new FormData();
        body.set("fullName", fullName);
        body.set("phoneNumber", phoneNumber);
        body.set("membershipStartDate", String(startDate));
        body.set("dateOfJoining", String(startDate));
        body.set("membershipDurationMonths", String(effectiveDuration));
        if (isFinite(periodDays) && periodDays > 0) body.set("membershipDurationDays", String(Math.round(periodDays)));
        else body.delete("membershipDurationDays");
        body.set("paymentMode", payment && payment.value ? String(payment.value) : "cash");
        body.set("paymentReceived", paymentReceived && paymentReceived.value ? String(paymentReceived.value) : "0");
        if (deposit && deposit.value) body.set("depositDate", String(deposit.value));
        if (profileFileInput && profileFileInput.files && profileFileInput.files[0]) {
          body.set("profilePhoto", profileFileInput.files[0]);
        }

        showMemberEditFallbackMessage("Saving changes...", false);
        fetch("/api/members/" + memberId, {
          method: "PUT",
          body: body,
          credentials: "same-origin",
        })
          .then(function (resp) {
            return resp
              .json()
              .catch(function () {
                return {};
              })
              .then(function (data) {
                return { ok: resp.ok, data: data };
              });
          })
          .then(function (result) {
            if (!result.ok) {
              var err = (result.data && (result.data.error || result.data.message)) || "Failed to update member";
              throw new Error(err);
            }
            showMemberEditFallbackMessage("Member updated successfully. Redirecting...", false);
            setTimeout(function () {
              window.location.href = "/members";
            }, 220);
          })
          .catch(function (err) {
            showMemberEditFallbackMessage(err && err.message ? err.message : "Failed to update member", true);
          });
      },
      true
    );
  }

  function ensureExtraFields() {
    if (!isMemberFormRoute(window.location.pathname)) return;
    var form = getMemberForm();
    if (!form) return;
    var existing = qs("#" + FIELD_ROOT_ID, form);
    if (existing) return;
    var misplaced = qs("#" + FIELD_ROOT_ID);
    if (misplaced && !form.contains(misplaced)) misplaced.remove();

    var root = document.createElement("section");
    root.id = FIELD_ROOT_ID;
    root.className = "rounded-2xl border bg-card p-6 space-y-5 gm-patch-enter";
    root.innerHTML =
      '<h2 class="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Payment Details</h2>' +
      '<div class="grid sm:grid-cols-2 gap-4">' +
      '<label class="flex flex-col gap-1.5 text-sm">Mode of Payment' +
      '<input id="gm-payment-mode" type="hidden" value="cash" />' +
      '<div id="gm-payment-mode-buttons" class="grid grid-cols-2 gap-2">' +
      '<button type="button" data-value="cash" class="gm-pay-btn rounded-xl border px-3 py-2 text-sm font-medium transition-all">Cash</button>' +
      '<button type="button" data-value="online" class="gm-pay-btn rounded-xl border px-3 py-2 text-sm font-medium transition-all">Online</button>' +
      "</div></label>" +
      '<label class="flex flex-col gap-1.5 text-sm">Payment Received' +
      '<div class="gm-money-wrap">' +
      '<span class="gm-money-prefix">INR</span>' +
      '<input id="gm-payment-received" type="number" min="0" step="0.01" placeholder="0.00" class="gm-money-input" />' +
      "</div></label>" +
      '<label class="flex flex-col gap-1.5 text-sm">Start Date' +
      '<div class="gm-date-wrap flex items-center gap-2">' +
      '<input id="gm-date-joining" type="date" class="gm-date-input w-full rounded-xl border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" />' +
      '<button type="button" aria-label="Open joining date calendar" class="gm-date-open gm-icon-btn rounded-xl border border-input bg-background p-2.5 text-sm hover:bg-accent/40" data-target="gm-date-joining"></button>' +
      "</div>" +
      '<div class="flex items-center gap-2">' +
      '<button type="button" class="gm-date-today text-xs rounded-lg border border-input px-2 py-1 hover:bg-accent/40" data-target="gm-date-joining">Today</button>' +
      '<button type="button" class="gm-date-clear text-xs rounded-lg border border-input px-2 py-1 hover:bg-accent/40" data-target="gm-date-joining">Clear</button>' +
      "</div>" +
      '</label>' +
      '<label class="flex flex-col gap-1.5 text-sm">End Date' +
      '<input id="gm-date-end" type="date" readonly class="gm-date-input w-full rounded-xl border border-input bg-background px-3 py-2 text-sm shadow-sm" />' +
      '<span class="text-xs text-muted-foreground">Auto-calculated from selected membership plan</span>' +
      '</label>' +
      '<label class="flex flex-col gap-1.5 text-sm sm:col-span-2">Deposit Date' +
      '<div class="gm-date-wrap flex items-center gap-2">' +
      '<input id="gm-deposit-date" type="date" class="gm-date-input w-full rounded-xl border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" />' +
      '<button type="button" aria-label="Open deposit date calendar" class="gm-date-open gm-icon-btn rounded-xl border border-input bg-background p-2.5 text-sm hover:bg-accent/40" data-target="gm-deposit-date"></button>' +
      "</div>" +
      '<div class="flex items-center gap-2">' +
      '<button type="button" class="gm-date-today text-xs rounded-lg border border-input px-2 py-1 hover:bg-accent/40" data-target="gm-deposit-date">Today</button>' +
      '<button type="button" class="gm-date-clear text-xs rounded-lg border border-input px-2 py-1 hover:bg-accent/40" data-target="gm-deposit-date">Clear</button>' +
      "</div>" +
      "</label>" +
      "</div>";

    var submitRow = qsa("div", form).find(function (d) {
      return /Create Member|Save Changes/i.test(d.textContent || "");
    });
    if (submitRow && submitRow.parentNode) submitRow.parentNode.insertBefore(root, submitRow);
    else form.appendChild(root);

    var joiningInput = qs("#gm-date-joining");
    if (joiningInput && !joiningInput.value) joiningInput.value = todayIso();
    syncCustomStartDateToNativeInput();

    renameStartDateLabel();
    hideMembershipStartDateForNewMember();
    ensureMembershipStartDateDefaultForNewMember();
    bindPaymentButtons();
    setupMembershipTypeFieldsForMemberForm();
    bindCreateMemberFallbackSubmit();
    bindEditMemberFallbackSubmit();
    updateProjectedEndDateField();
    bindDateControls();
    loadExistingMemberFields();
    ensureIndiaCountryCodeInPhoneField();
  }

  function bindDateControls() {
    qsa(".gm-icon-btn").forEach(function (btn) {
      if (btn.getAttribute("data-icon") === "1") return;
      btn.setAttribute("data-icon", "1");
      btn.innerHTML =
        '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false" class="opacity-80">' +
        '<path fill="currentColor" d="M7 2h2v2h6V2h2v2h3a2 2 0 0 1 2 2v13a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V6a2 2 0 0 1 2-2h3V2Zm13 8H4v9a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-9ZM4 8h16V6H4v2Z"/></svg>';
    });

    qsa(".gm-date-open").forEach(function (btn) {
      if (btn.getAttribute("data-bound") === "1") return;
      btn.setAttribute("data-bound", "1");
      btn.addEventListener("click", function () {
        var target = qs("#" + btn.getAttribute("data-target"));
        if (!target) return;
        target.focus();
        if (typeof target.showPicker === "function") {
          try {
            target.showPicker();
          } catch (_e) {}
        }
      });
    });

    qsa(".gm-date-today").forEach(function (btn) {
      if (btn.getAttribute("data-bound") === "1") return;
      btn.setAttribute("data-bound", "1");
      btn.addEventListener("click", function () {
        var target = qs("#" + btn.getAttribute("data-target"));
        if (!target) return;
        target.value = todayIso();
        target.dispatchEvent(new Event("input", { bubbles: true }));
        target.dispatchEvent(new Event("change", { bubbles: true }));
        if (btn.getAttribute("data-target") === "gm-date-joining") syncCustomStartDateToNativeInput();
      });
    });

    qsa(".gm-date-clear").forEach(function (btn) {
      if (btn.getAttribute("data-bound") === "1") return;
      btn.setAttribute("data-bound", "1");
      btn.addEventListener("click", function () {
        var target = qs("#" + btn.getAttribute("data-target"));
        if (!target) return;
        target.value = "";
        target.dispatchEvent(new Event("input", { bubbles: true }));
        target.dispatchEvent(new Event("change", { bubbles: true }));
        if (btn.getAttribute("data-target") === "gm-date-joining") syncCustomStartDateToNativeInput();
      });
    });
  }

  function loadExistingMemberFields() {
    var memberId = getMemberIdFromPath(window.location.pathname);
    if (!memberId) return;
    fetch("/api/members/" + memberId)
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (m) {
        if (!m) return;
        if (m.paymentMode) setPaymentMode(String(m.paymentMode));
        if (typeof m.paymentReceived !== "undefined" && qs("#gm-payment-received")) {
          qs("#gm-payment-received").value = String(m.paymentReceived);
        }
        if (m.dateOfJoining && qs("#gm-date-joining")) qs("#gm-date-joining").value = String(m.dateOfJoining).slice(0, 10);
        if (m.depositDate && qs("#gm-deposit-date")) qs("#gm-deposit-date").value = String(m.depositDate).slice(0, 10);
        if (m.membershipDurationDays && qs("#gm-member-mtype-period")) {
          var periodInput = qs("#gm-member-mtype-period");
          periodInput.value = String(m.membershipDurationDays);
          periodInput.dispatchEvent(new Event("input", { bubbles: true }));
          periodInput.dispatchEvent(new Event("change", { bubbles: true }));
        } else if (m.membershipDurationMonths) {
          syncMemberTypeFieldsFromDuration(m.membershipDurationMonths);
          if (qs("#gm-duration-range")) setDurationScrollbarValue(m.membershipDurationMonths);
          else setNativeDurationValue(m.membershipDurationMonths);
        }
        if (m.membershipEndDate && qs("#gm-date-end")) qs("#gm-date-end").value = String(m.membershipEndDate).slice(0, 10);
        else updateProjectedEndDateField();
      })
      .catch(function () {});
  }

  function decorateMembersDashboardPayment() {
    if (!isMembersDashboardRoute(window.location.pathname)) return;
    // Stability guard: avoid mutating React-managed table DOM.
    // Direct cell/column edits can desync React reconciliation during search/filter rerenders.
    return;
    var table = qs("table");
    if (!table) return;
    if (!paymentByMemberId || !paymentByMemberId.byId) return;

    function removeDurationColumn() {
      var headRowLocal = qs("thead tr", table);
      if (!headRowLocal) return;
      var headers = qsa("th", headRowLocal);
      if (!headers || !headers.length) return;
      var durationIndex = -1;
      headers.forEach(function (th, idx) {
        var label = String(th.textContent || "").trim().toLowerCase();
        if (label === "duration" || label === "membership duration") durationIndex = idx;
      });
      if (durationIndex < 0) return;
      if (headers[durationIndex]) headers[durationIndex].remove();
      qsa("tbody tr", table).forEach(function (tr) {
        var cells = qsa("td", tr);
        if (durationIndex >= 0 && durationIndex < cells.length) cells[durationIndex].remove();
      });
    }

    removeDurationColumn();

    var headRow = qs("thead tr", table);
    if (headRow) {
      function ensureHeader(colKey, label) {
        var existingHead = qs('th[data-gm-col="' + colKey + '"]', headRow);
        if (existingHead) return existingHead;
        var th = document.createElement("th");
        th.setAttribute("data-gm-col", colKey);
        th.className = "h-10 px-2 text-left align-middle font-medium text-muted-foreground";
        th.textContent = label;
        headRow.appendChild(th);
        return th;
      }
      ensureHeader("membership-type", "Membership Type");
      ensureHeader("membership-period", "Membership Period");
      ensureHeader("payment-mode", "Payment Mode");
    }

    function parseIsoDate(value) {
      var v = String(value || "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
      var d = new Date(v + "T00:00:00");
      return isNaN(d.getTime()) ? null : d;
    }

    function computePeriodDays(memberRow) {
      if (!memberRow) return 0;
      var start = parseIsoDate(memberRow.membershipStartDate);
      var end = parseIsoDate(memberRow.membershipEndDate);
      if (start && end) {
        var diff = Math.round((end.getTime() - start.getTime()) / 86400000);
        if (isFinite(diff) && diff > 0) return diff;
      }
      var months = Number(memberRow.membershipDurationMonths || 0);
      if (isFinite(months) && months > 0) return Math.round(months * 30);
      return 0;
    }

    function getDashboardMembershipPlans() {
      var merged = [];
      var seen = {};
      function pushPlan(name, periodDays) {
        var cleanName = String(name || "").trim();
        var daysNum = Number(periodDays);
        if (!cleanName || !isFinite(daysNum) || daysNum <= 0) return;
        var days = String(Math.round(daysNum));
        var key = cleanName.toLowerCase() + "|" + days;
        if (seen[key]) return;
        seen[key] = true;
        merged.push({ name: cleanName, periodDays: days });
      }
      getMembershipTypeRecords().forEach(function (row) {
        if (!row) return;
        pushPlan(row.name, row.periodDays);
      });
      return merged;
    }

    function resolveMemberTypeAndPeriod(memberRow, membershipPlans) {
      var days = computePeriodDays(memberRow);
      var durationMonths = Number(memberRow && memberRow.membershipDurationMonths);
      var matchedPlan = null;
      if (days > 0 && Array.isArray(membershipPlans)) {
        matchedPlan = membershipPlans.find(function (plan) {
          return Number(plan.periodDays) === days;
        });
      }
      var typeName =
        (matchedPlan && matchedPlan.name) ||
        (isFinite(durationMonths) && durationMonths > 0 ? membershipPlanNameFromMonths(durationMonths) : "-");
      var periodLabel = days > 0 ? String(days) + " Days" : "-";
      return { typeName: typeName || "-", periodLabel: periodLabel };
    }

    function ensureRowCell(tr, cellKey) {
      var existingCell = tr.querySelector('td[data-gm-cell="' + cellKey + '"]');
      if (existingCell) return existingCell;
      var td = document.createElement("td");
      td.setAttribute("data-gm-cell", cellKey);
      td.className = "p-2 align-middle";
      tr.appendChild(td);
      return td;
    }

    var membershipPlans = getDashboardMembershipPlans();
    qsa("tbody tr", table).forEach(function (tr, index) {
      if (tr.querySelector('td[colspan]')) return;
      var text = tr.textContent || "";
      var mid = text.match(/GYM-\d{4,}/);
      var rowData = null;
      if (mid && paymentByMemberId.byId[mid[0]]) rowData = paymentByMemberId.byId[mid[0]];
      if (!rowData && paymentByMemberId.ordered[index]) rowData = paymentByMemberId.ordered[index];
      if (!rowData) return;
      if (typeof rowData === "string") rowData = { paymentMode: rowData };

      var payment = normalizePaymentMode(rowData.paymentMode);
      var typePeriod = resolveMemberTypeAndPeriod(rowData, membershipPlans);
      var typeCell = ensureRowCell(tr, "membership-type");
      var periodCell = ensureRowCell(tr, "membership-period");
      var existing = ensureRowCell(tr, "payment-mode");

      if (typeCell.getAttribute("data-gm-value") !== typePeriod.typeName) {
        typeCell.setAttribute("data-gm-value", typePeriod.typeName);
        typeCell.textContent = typePeriod.typeName;
      }
      if (periodCell.getAttribute("data-gm-value") !== typePeriod.periodLabel) {
        periodCell.setAttribute("data-gm-value", typePeriod.periodLabel);
        periodCell.textContent = typePeriod.periodLabel;
      }

      var badgeHtml =
        '<span class="inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ' +
        (payment === "Online"
          ? "bg-primary/10 text-primary border-primary/20"
          : "bg-amber-500/10 text-amber-700 border-amber-500/20") +
        '">' +
        payment +
        "</span>";
      if (existing.getAttribute("data-gm-payment") !== payment) {
        existing.setAttribute("data-gm-payment", payment);
        existing.innerHTML = badgeHtml;
      }
    });
  }

  function scheduleDashboardDecorate() {
    if (dashboardDecorateTimer) clearTimeout(dashboardDecorateTimer);
    dashboardDecorateTimer = setTimeout(function () {
      decorateMembersDashboardPayment();
    }, 60);
  }

  function setupDashboardObserver() {
    if (!isMembersDashboardRoute(window.location.pathname)) {
      if (dashboardObserver) {
        dashboardObserver.disconnect();
        dashboardObserver = null;
      }
      return;
    }
    var tableWrap = qs("table") ? qs("table").parentElement : document.body;
    if (!tableWrap) return;
    if (dashboardObserver) dashboardObserver.disconnect();
    dashboardObserver = new MutationObserver(function () {
      scheduleDashboardDecorate();
    });
    dashboardObserver.observe(tableWrap, { childList: true, subtree: true });
  }

  function formatDurationShort(value) {
    var n = Number(value || 0);
    if (!n) return "-";
    return (n % 1 === 0 ? String(n.toFixed(0)) : String(n.toFixed(1))) + " mo";
  }

  function normalizeFeeValue(value) {
    if (value === null || value === undefined || value === "") return null;
    var n = Number(value);
    if (!isFinite(n) || n < 0) return null;
    return n;
  }

  function readMemberFee(member) {
    if (!member) return null;
    return normalizeFeeValue(
      member.membershipFee != null
        ? member.membershipFee
        : member.fee != null
          ? member.fee
          : member.fees != null
            ? member.fees
            : member.feeAmount != null
              ? member.feeAmount
              : member.amountPaid
    );
  }

  function formatFeeShort(value) {
    var fee = normalizeFeeValue(value);
    if (fee === null) return "Fee N/A";
    return "Fee \u20b9" + (fee % 1 === 0 ? String(fee.toFixed(0)) : String(fee.toFixed(2)));
  }

  function durationFeeKey(duration, fee) {
    var feePart = fee === null ? "na" : String(fee);
    return String(duration) + "|" + feePart;
  }

  function ensureMembershipTypeNavLink() {
    function resetNavButtonToDefault(linkEl) {
      if (!linkEl) return;
      linkEl.classList.remove(
        "gm-mtype-nav-active",
        "bg-primary",
        "text-primary-foreground",
        "shadow-sm",
        "shadow-md",
        "shadow-lg",
        "ring-1",
        "ring-2",
        "ring-primary",
        "border-primary"
      );
      linkEl.removeAttribute("aria-current");
      linkEl.removeAttribute("data-active");
    }

    function normalizeMembershipTypeLabel(linkEl) {
      if (!linkEl) return;
      var textNodes = qsa("span,div,p", linkEl).filter(function (el) {
        return !el.querySelector("*") && (el.textContent || "").trim().length > 0;
      });
      if (!textNodes.length) return;
      var labelNode =
        textNodes.find(function (el) {
          return /^members?$/i.test((el.textContent || "").trim());
        }) ||
        textNodes.find(function (el) {
          return /membership\s*type/i.test((el.textContent || "").trim());
        }) ||
        qs("[data-slot='title']", linkEl) ||
        textNodes
          .slice()
          .find(function (el) {
            return /[A-Za-z]/.test((el.textContent || "").trim());
          }) ||
        textNodes[0];
      labelNode.textContent = "Membership Type";
      labelNode.setAttribute("data-gm-nav-label", "membership-type");
      textNodes.forEach(function (node) {
        if (node === labelNode) return;
        var txt = (node.textContent || "").trim();
        if (txt.length > 0) node.remove();
      });
    }

    var existing = qsa('a[href="/membership-type"],a[href="/membership-type/add"]').find(function (a) {
      return a.getAttribute("data-gm-nav") === "membership-type";
    });
    if (existing) {
      resetNavButtonToDefault(existing);
      normalizeMembershipTypeLabel(existing);
      updateMembershipTypeNavActiveState();
      return true;
    }

    var allTemplates = qsa('a[href="/notifications"],a[href="/calendar"],a[href="/members"]');
    var template =
      allTemplates.find(function (a) {
        return a.getAttribute("aria-current") !== "page" && !a.classList.contains("bg-primary");
      }) || allTemplates[0];
    if (!template || !template.parentElement) return false;

    var link = template.cloneNode(true);
    resetNavButtonToDefault(link);
    link.setAttribute("href", "/membership-type/add");
    link.setAttribute("data-gm-nav", "membership-type");
    link.classList.add("gm-membership-type-nav-btn");
    var textLeafNodes = qsa("span,div,p", link).filter(function (el) {
      var txt = (el.textContent || "").trim();
      return !el.querySelector("*") && txt.length > 0;
    });
    var labelCandidates = textLeafNodes.filter(function (el) {
      var txt = (el.textContent || "").trim();
      return /[A-Za-z]/.test(txt) && !/^\d+$/.test(txt);
    });
    var labelNode = labelCandidates[0] || qs("[data-slot='title']", link) || qs("span:last-child", link);
    if (labelNode) labelNode.textContent = "Membership Type";
    else {
      var fallbackLabel = document.createElement("span");
      fallbackLabel.textContent = "Membership Type";
      link.appendChild(fallbackLabel);
      labelNode = fallbackLabel;
    }
    // Remove duplicate Membership Type labels so it appears only once in the button.
    normalizeMembershipTypeLabel(link);

    // Ensure an icon exists and uses the same UI color/class system as other nav buttons.
    if (!qs("svg", link)) {
      var templateIcon = qs("svg", template);
      if (templateIcon) link.insertBefore(templateIcon.cloneNode(true), link.firstChild || null);
    }
    // Use a distinct icon for Membership Type (not the same as Members).
    var iconNode = qs("svg", link);
    if (iconNode) {
      var iconClass = iconNode.getAttribute("class");
      var iconAttrs = {
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        "stroke-width": "2",
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
      };
      iconNode.outerHTML =
        '<svg viewBox="' +
        iconAttrs.viewBox +
        '" fill="' +
        iconAttrs.fill +
        '" stroke="' +
        iconAttrs.stroke +
        '" stroke-width="' +
        iconAttrs["stroke-width"] +
        '" stroke-linecap="' +
        iconAttrs["stroke-linecap"] +
        '" stroke-linejoin="' +
        iconAttrs["stroke-linejoin"] +
        '"' +
        (iconClass ? ' class="' + iconClass + '"' : "") +
        ' aria-hidden="true">' +
        '<rect x="3" y="4" width="7" height="7" rx="1.5"></rect>' +
        '<rect x="14" y="4" width="7" height="7" rx="1.5"></rect>' +
        '<rect x="3" y="13" width="7" height="7" rx="1.5"></rect>' +
        '<path d="M14 17h7"></path>' +
        '<path d="M17.5 13v8"></path>' +
        "</svg>";
    }
    link.addEventListener("click", function (ev) {
      ev.preventDefault();
      link.classList.add("gm-mtype-nav-active");
      history.pushState({}, "", "/membership-type/add");
      setTimeout(onRouteChange, 50);
    });
    template.parentElement.appendChild(link);
    updateMembershipTypeNavActiveState();
    return true;
  }

  function updateMembershipTypeNavActiveState() {
    var nav = qsa('a[data-gm-nav="membership-type"]');
    if (!nav.length) return;
    var active = isMembershipTypeRoute(window.location.pathname);
    nav.forEach(function (link) {
      link.classList.toggle("gm-mtype-nav-active", active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  }

  function ensureMembershipTypeNavLinkFromStart() {
    if (ensureMembershipTypeNavLink()) {
      if (navBootstrapObserver) {
        navBootstrapObserver.disconnect();
        navBootstrapObserver = null;
      }
      if (navBootstrapTimer) {
        clearTimeout(navBootstrapTimer);
        navBootstrapTimer = null;
      }
      return;
    }

    if (!navBootstrapObserver) {
      navBootstrapObserver = new MutationObserver(function () {
        if (ensureMembershipTypeNavLink()) {
          navBootstrapObserver.disconnect();
          navBootstrapObserver = null;
          if (navBootstrapTimer) {
            clearTimeout(navBootstrapTimer);
            navBootstrapTimer = null;
          }
        }
      });
      navBootstrapObserver.observe(document.body, { childList: true, subtree: true });
    }

    if (!navBootstrapTimer) {
      navBootstrapTimer = setTimeout(function () {
        if (navBootstrapObserver) {
          navBootstrapObserver.disconnect();
          navBootstrapObserver = null;
        }
        navBootstrapTimer = null;
      }, 20000);
    }
  }

  function ensureMemberFormEnhancementsFromStart() {
    if (!isMemberFormRoute(window.location.pathname)) {
      if (memberFormObserver) {
        memberFormObserver.disconnect();
        memberFormObserver = null;
      }
      if (memberFormTimer) {
        clearTimeout(memberFormTimer);
        memberFormTimer = null;
      }
      if (memberFormBootstrapTimer) {
        clearTimeout(memberFormBootstrapTimer);
        memberFormBootstrapTimer = null;
      }
      return;
    }

    // On hard refresh, the app can render the base form first and then re-render.
    // Re-apply for a short window so the enhanced layout always sticks.
    if (!memberFormBootstrapTimer) {
      var attempts = 0;
      var maxAttempts = 90; // ~9 seconds at 100ms
      var tick = function () {
        if (!isMemberFormRoute(window.location.pathname)) {
          memberFormBootstrapTimer = null;
          return;
        }
        ensureExtraFields();
        ensureIndiaCountryCodeInPhoneField();
        attempts += 1;
        if (attempts >= maxAttempts) {
          memberFormBootstrapTimer = null;
          return;
        }
        memberFormBootstrapTimer = setTimeout(tick, 100);
      };
      memberFormBootstrapTimer = setTimeout(tick, 0);
    }

    ensureExtraFields();
    ensureIndiaCountryCodeInPhoneField();

    if (!memberFormObserver) {
      memberFormObserver = new MutationObserver(function () {
        ensureExtraFields();
        ensureIndiaCountryCodeInPhoneField();
      });
      memberFormObserver.observe(document.body, { childList: true, subtree: true });
    }
  }

  function restoreMembershipTypeRouteAfterBoot() {
    if (membershipRouteBootstrapped) return false;
    membershipRouteBootstrapped = true;
    var pending = null;
    try {
      pending = sessionStorage.getItem("gm.pending.membershipTypeRoute");
    } catch (err) {
      pending = null;
    }
    if (!pending || !/^\/membership-type(\/(add|list))?\/?/.test(pending)) return false;
    try {
      sessionStorage.removeItem("gm.pending.membershipTypeRoute");
    } catch (err) {}
    if (isMembershipTypeRoute(window.location.pathname)) return false;
    history.replaceState({}, "", pending);
    setTimeout(onRouteChange, 50);
    return true;
  }

  function removeMembershipTypeView() {
    var view = qs("#gm-membership-type-view");
    if (view) view.remove();
    qsa("[data-gm-mtype-hidden='1']").forEach(function (el) {
      var prev = el.getAttribute("data-gm-mtype-prev-display");
      el.style.display = prev || "";
      el.removeAttribute("data-gm-mtype-hidden");
      el.removeAttribute("data-gm-mtype-prev-display");
    });
  }

  function durationSortKey(value) {
    var n = Number(value);
    return isNaN(n) ? 0 : n;
  }

  function uniqueDurationFeeOptions(members) {
    var seen = {};
    var out = [];
    (members || []).forEach(function (m) {
      var duration = String(m.membershipDurationMonths);
      var fee = readMemberFee(m);
      var key = durationFeeKey(duration, fee);
      if (!seen[key]) {
        seen[key] = true;
        out.push({
          key: key,
          duration: duration,
          fee: fee,
        });
      }
    });
    out.sort(function (a, b) {
      var d = durationSortKey(a.duration) - durationSortKey(b.duration);
      if (d !== 0) return d;
      if (a.fee === null && b.fee !== null) return 1;
      if (a.fee !== null && b.fee === null) return -1;
      return Number(a.fee || 0) - Number(b.fee || 0);
    });
    return out;
  }

  function readLocalJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      var parsed = JSON.parse(raw);
      return parsed == null ? fallback : parsed;
    } catch (err) {
      return fallback;
    }
  }

  function writeLocalJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {}
  }

  function getMembershipTypeMeta() {
    var meta = readLocalJSON(MEMBERSHIP_TYPE_META_KEY, null);
    if (!meta || typeof meta !== "object") {
      meta = {
        categories: ["General", "Strength", "Cardio"],
        installmentPlans: ["Monthly", "Bi-Monthly", "Quarterly"],
        classes: ["None", "HIIT", "Yoga", "CrossFit", "Zumba"],
      };
      writeLocalJSON(MEMBERSHIP_TYPE_META_KEY, meta);
    }
    return meta;
  }

  function saveMembershipTypeMeta(meta) {
    writeLocalJSON(MEMBERSHIP_TYPE_META_KEY, meta);
  }

  function getMembershipTypeRecords() {
    var rows = readLocalJSON(MEMBERSHIP_TYPE_STORE_KEY, []);
    if (!Array.isArray(rows)) return [];
    return rows;
  }

  function saveMembershipTypeRecords(rows) {
    writeLocalJSON(MEMBERSHIP_TYPE_STORE_KEY, rows || []);
  }

  function notifyMembershipTypesUpdated() {
    try {
      window.dispatchEvent(new CustomEvent(MEMBERSHIP_TYPE_UPDATED_EVENT));
    } catch (_err) {}
  }

  function getSavedMembershipTypePlans() {
    var seen = {};
    return getMembershipTypeRecords()
      .filter(function (row) {
        var name = String((row && row.name) || "").trim();
        var days = Number(row && row.periodDays);
        if (!name || !isFinite(days) || days <= 0) return false;
        var uniq = name.toLowerCase() + "|" + String(Math.round(days));
        if (seen[uniq]) return false;
        seen[uniq] = true;
        return true;
      })
      .map(function (row, idx) {
        return {
          key: "saved-" + String(idx),
          name: String(row.name).trim(),
          periodDays: String(Math.round(Number(row.periodDays))),
        };
      })
      .sort(function (a, b) {
        var daysDiff = Number(a.periodDays) - Number(b.periodDays);
        if (daysDiff !== 0) return daysDiff;
        return a.name.localeCompare(b.name);
      });
  }

  function rebuildMemberTypeSelectOptions(typeSelect, preferredPeriodDays) {
    if (!typeSelect) return;
    var plans = getSavedMembershipTypePlans();
    var preferredDays = String(preferredPeriodDays || "").trim();
    var existingCustom = qs('option[value="custom-days"]', typeSelect);
    var customPeriodDays = existingCustom ? String(existingCustom.getAttribute("data-period-days") || "").trim() : "";
    var customPlanName = existingCustom ? String(existingCustom.getAttribute("data-plan-name") || "").trim() : "";

    var options = ['<option value="">Select Membership Type</option>'];
    plans.forEach(function (plan) {
      var optionLabel = plan.name + " (" + plan.periodDays + " Days)";
      options.push(
        '<option value="' +
          escapeHtml(plan.key) +
          '" data-plan-name="' +
          escapeHtml(plan.name) +
          '" data-period-days="' +
          escapeHtml(plan.periodDays) +
          '">' +
          escapeHtml(optionLabel) +
          "</option>"
      );
    });
    typeSelect.innerHTML = options.join("");

    if (customPeriodDays && !plans.some(function (plan) { return String(plan.periodDays) === customPeriodDays; })) {
      var customOption = document.createElement("option");
      customOption.value = "custom-days";
      customOption.textContent = customPlanName || String(customPeriodDays) + " Days Plan";
      customOption.setAttribute("data-plan-name", customOption.textContent);
      customOption.setAttribute("data-period-days", customPeriodDays);
      typeSelect.appendChild(customOption);
    }

    if (!preferredDays) return;
    var matched = qsa("option", typeSelect).find(function (option) {
      return String(option.getAttribute("data-period-days") || "") === preferredDays;
    });
    if (matched) typeSelect.value = matched.value;
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function isDarkThemeActive() {
    return document.documentElement.classList.contains("dark");
  }

  function setAppTheme(theme) {
    var next = String(theme || "").toLowerCase() === "light" ? "light" : "dark";
    try {
      localStorage.setItem("fitnestemple-theme", next);
    } catch (err) {}
    document.documentElement.classList.toggle("dark", next === "dark");
    document.documentElement.style.colorScheme = next;
  }

  function toggleAppTheme() {
    setAppTheme(isDarkThemeActive() ? "light" : "dark");
  }

  function syncAppThemeFromStorage() {
    var stored = null;
    try {
      stored = localStorage.getItem("fitnestemple-theme");
    } catch (err) {
      stored = null;
    }
    if (stored === "light" || stored === "dark") {
      setAppTheme(stored);
      return;
    }
    // Fallback to current DOM state if storage is absent.
    setAppTheme(isDarkThemeActive() ? "dark" : "light");
  }

  function updateMembershipTypeThemeButton(panel) {
    var btn = qs("#gm-mt-theme-toggle", panel || document);
    if (!btn) return;
    var dark = isDarkThemeActive();
    btn.setAttribute("data-theme", dark ? "dark" : "light");
    btn.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
    btn.setAttribute("title", dark ? "Light mode" : "Dark mode");
    btn.innerHTML = dark
      ? '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M6.76 4.84l-1.8-1.79-1.42 1.41 1.79 1.8 1.43-1.42zm10.45 14.32l1.79 1.8 1.42-1.42-1.8-1.79-1.41 1.41zM12 4V1h-2v3h2zm0 19v-3h-2v3h2zm8-11h3v-2h-3v2zM4 12v-2H1v2h3zm12.24-5.16l1.41-1.42-1.79-1.8-1.42 1.42 1.8 1.8zM5.34 17.66l-1.8 1.79 1.42 1.42 1.79-1.8-1.41-1.41zM11 7a5 5 0 100 10 5 5 0 000-10z"/></svg>'
      : '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M21 12.79A9 9 0 1111.21 3c.33 0 .66.02.99.07A7 7 0 0021 12.79z"/></svg>';
  }

  function membershipTypeShellHTML(mode, meta, records) {
    var breadcrumbTail = "Membership Type";

    var tableRows = (records || [])
      .map(function (row, idx) {
        return (
          "<tr>" +
          '<td class="gm-mt-td">' +
          escapeHtml(row.name) +
          "</td>" +
          '<td class="gm-mt-td">' +
          escapeHtml(row.periodDays) +
          " Days</td>" +
          '<td class="gm-mt-td">' +
          '<button type="button" class="gm-mt-link-btn" data-edit-mtype="' +
          String(idx) +
          '">Edit</button> ' +
          '<button type="button" class="gm-mt-link-btn gm-mt-link-btn-danger" data-delete-mtype="' +
          String(idx) +
          '">Delete</button>' +
          "</td>" +
          "</tr>"
        );
      })
      .join("");

    var addForm =
      '<form id="gm-membership-type-form" class="gm-mt-form" novalidate>' +
      '<input id="gm-mt-edit-index" type="hidden" value="" />' +
      '<div class="gm-mt-grid">' +
      '<div class="gm-mt-field"><label>Membership Type Name <span>*</span></label><div class="gm-mt-name-wrap"><input id="gm-mt-name-input" class="gm-member-mtype-input" type="text" autocomplete="off" placeholder="Type Membership Type (Monthly, Quarterly, Yearly)" /><div id="gm-mt-name-suggest" class="gm-mt-suggest gm-mt-hidden" role="listbox" aria-label="Membership Type suggestions"></div></div><div id="gm-mt-name-hint" class="gm-mt-hint">Add multiple names separated by comma or new line.</div><div id="gm-err-name" class="gm-mt-error"></div></div>' +
      '<div class="gm-mt-field"><label>Membership Type Period <span>*</span></label><input id="gm-mt-period" type="text" inputmode="numeric" placeholder="No. of Days (45)" /><div id="gm-err-period" class="gm-mt-error"></div></div>' +
      "</div>" +
      '<div class="gm-mt-actions"><button type="submit" class="gm-mt-primary-btn">Save Membership Type</button><div id="gm-mt-submit-msg" class="gm-mt-success" aria-live="polite"></div></div>' +
      "</form>";

    var tableContent =
      '<div class="gm-mt-table-wrap">' +
      '<table class="gm-mt-table"><thead><tr><th>Membership Type Name</th><th>Days</th><th>Action</th></tr></thead><tbody>' +
      (tableRows || '<tr><td colspan="3" class="gm-mt-empty">No Membership Type records yet.</td></tr>') +
      "</tbody></table></div>";

    return (
      '<div class="gm-mt-shell gm-mt-fade-up">' +
      '<div class="gm-mt-top-strip">' +
      '<div class="gm-mt-top-left">' +
      '<span class="gm-mt-top-icon" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M12 3c1.2 2 2 3.8 2 5.8a4.6 4.6 0 0 1-4.6 4.6c-1.5 0-2.7-.6-3.5-1.6a7.4 7.4 0 0 0-.9 3.3A7 7 0 0 0 12 22a7 7 0 0 0 7-6.9c0-4.1-2.2-7.1-7-12.1Z"></path>' +
      "</svg>" +
      "</span>" +
      '<span class="gm-mt-top-title">Membership Type</span>' +
      "</div>" +
      '<button type="button" id="gm-mt-theme-toggle" class="gm-mt-theme-btn" aria-label="Toggle theme"></button>' +
      "</div>" +
      '<section class="gm-mt-page">' +
      '<div class="gm-mt-page-head"><div><h1>' +
      escapeHtml(breadcrumbTail) +
      '</h1><div class="gm-mt-breadcrumb"><button type="button" data-go="/dashboard">Dashboard</button><span>&gt;</span><button type="button" data-go="/membership-type/add">Membership Type</button><span>&gt;</span><strong>' +
      escapeHtml(breadcrumbTail) +
      "</strong></div></div></div>" +
      '<div class="gm-mt-card rounded-2xl border bg-card p-6 shadow-sm">' +
      addForm +
      tableContent +
      "</div></section></div>"
    );
  }

  function bindMembershipTypeButtons(panel) {
    qsa("button[data-go]", panel).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var target = btn.getAttribute("data-go") || "/membership-type/add";
        history.pushState({}, "", target);
        setTimeout(onRouteChange, 50);
      });
    });

    qsa("button[data-delete-mtype]", panel).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var idx = Number(btn.getAttribute("data-delete-mtype"));
        var rows = getMembershipTypeRecords();
        if (!isFinite(idx) || idx < 0 || idx >= rows.length) return;
        rows.splice(idx, 1);
        saveMembershipTypeRecords(rows);
        notifyMembershipTypesUpdated();
        renderMembershipTypeContent();
      });
    });

    qsa("button[data-edit-mtype]", panel).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var idx = Number(btn.getAttribute("data-edit-mtype"));
        var rows = getMembershipTypeRecords();
        if (!isFinite(idx) || idx < 0 || idx >= rows.length) return;
        var row = rows[idx] || {};
        var form = qs("#gm-membership-type-form", panel);
        if (!form) return;
        var nameInput = qs("#gm-mt-name-input", form);
        var periodInput = qs("#gm-mt-period", form);
        var editIndexInput = qs("#gm-mt-edit-index", form);
        var saveBtn = qs('button[type="submit"]', form);
        var rowName = String(row.name || "").trim();
        if (nameInput) nameInput.value = rowName;
        if (periodInput) periodInput.value = String(row.periodDays || "");
        if (editIndexInput) editIndexInput.value = String(idx);
        if (saveBtn) saveBtn.textContent = "Update Membership Type";
        form.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });

    var themeBtn = qs("#gm-mt-theme-toggle", panel);
    if (themeBtn && themeBtn.getAttribute("data-bound") !== "1") {
      themeBtn.setAttribute("data-bound", "1");
      updateMembershipTypeThemeButton(panel);
      themeBtn.addEventListener("click", function () {
        toggleAppTheme();
        updateMembershipTypeThemeButton(panel);
      });
    }
  }

  function renderMembershipTypeContent() {
    if (!isMembershipTypeRoute(window.location.pathname)) return;
    var view = qs("#gm-membership-type-view");
    if (!view) return;
    var panel = qs("#gm-membership-type-panel", view);
    if (!panel) return;

    var mode = membershipTypeMode(window.location.pathname);
    var meta = getMembershipTypeMeta();
    var records = getMembershipTypeRecords();
    panel.innerHTML = membershipTypeShellHTML(mode, meta, records);
    bindMembershipTypeButtons(panel);
    updateMembershipTypeThemeButton(panel);
    if (mode === "add") bindMembershipTypeForm(panel);
  }

  function setFieldError(id, message) {
    var el = qs("#" + id);
    if (!el) return;
    el.textContent = message || "";
    el.classList.toggle("gm-mt-error-show", !!message);
  }

  function limitBlockEnabled(enabled) {
    var block = qs("#gm-mt-limited-block");
    if (!block) return;
    block.classList.toggle("gm-mt-disabled", !enabled);
    qsa("input,select", block).forEach(function (field) {
      field.disabled = !enabled;
    });
  }

  function isLettersOnly(value) {
    return /^[A-Za-z\s]+$/.test(String(value || "").trim());
  }

  function isNumericValue(value) {
    return /^\d+(\.\d{1,2})?$/.test(String(value || "").trim());
  }

  function parseMembershipTypeNames(rawValue) {
    return String(rawValue || "")
      .split(/[\n,]+/)
      .map(function (name) {
        return String(name || "").trim();
      })
      .filter(Boolean)
      .filter(function (name, idx, arr) {
        var key = name.toLowerCase();
        return arr.findIndex(function (candidate) {
          return String(candidate || "").toLowerCase() === key;
        }) === idx;
      });
  }

  function parseEditIndex(rawValue) {
    var raw = String(rawValue == null ? "" : rawValue).trim();
    if (!raw) return NaN;
    var idx = Number(raw);
    return isFinite(idx) ? idx : NaN;
  }

  function bindMembershipTypeForm(panel) {
    var form = qs("#gm-membership-type-form", panel);
    if (!form) return;
    var nameInput = qs("#gm-mt-name-input", form);
    var nameSuggest = qs("#gm-mt-name-suggest", form);
    var periodInput = qs("#gm-mt-period", form);
    var editIndexInput = qs("#gm-mt-edit-index", form);
    var submitMsg = qs("#gm-mt-submit-msg", form);

    function activeMembershipNameValue() {
      return String((nameInput && nameInput.value) || "").trim();
    }

    function membershipNameSuggestions() {
      var seen = {};
      return getMembershipTypeRecords()
        .map(function (row) {
          return String((row && row.name) || "").trim();
        })
        .filter(Boolean)
        .filter(function (name) {
          var key = name.toLowerCase();
          if (seen[key]) return false;
          seen[key] = true;
          return true;
        })
        .sort(function (a, b) {
          return a.localeCompare(b);
        });
    }

    function currentNameFragment() {
      var raw = String((nameInput && nameInput.value) || "");
      var match = raw.match(/(?:^|[\n,])\s*([^,\n]*)$/);
      return String((match && match[1]) || "").trim();
    }

    function hideNameSuggestions() {
      if (!nameSuggest) return;
      nameSuggest.innerHTML = "";
      nameSuggest.classList.add("gm-mt-hidden");
    }

    function showNameSuggestions() {
      if (!nameInput || !nameSuggest) return;
      var fragment = currentNameFragment().toLowerCase();
      var selectedNames = parseMembershipTypeNames(nameInput.value).map(function (name) {
        return name.toLowerCase();
      });
      var selectedMap = {};
      selectedNames.forEach(function (name) {
        selectedMap[name] = true;
      });
      var matches = membershipNameSuggestions()
        .filter(function (name) {
          var key = name.toLowerCase();
          if (selectedMap[key] && key !== fragment) return false;
          if (!fragment) return true;
          return key.indexOf(fragment) !== -1;
        })
        .slice(0, 8);

      if (!matches.length) {
        hideNameSuggestions();
        return;
      }

      nameSuggest.innerHTML = matches
        .map(function (name) {
          return (
            '<button type="button" class="gm-mt-suggest-item" data-mt-suggest="' +
            escapeHtml(name) +
            '">' +
            escapeHtml(name) +
            "</button>"
          );
        })
        .join("");
      nameSuggest.classList.remove("gm-mt-hidden");
    }

    function applyNameSuggestion(nextName) {
      if (!nameInput) return;
      var raw = String(nameInput.value || "");
      var normalizedName = String(nextName || "").trim();
      if (!normalizedName) return;
      var match = raw.match(/([\s\S]*?(?:^|[\n,]\s*))([^,\n]*)$/);
      if (match) {
        var prefix = String(match[1] || "");
        nameInput.value = prefix + normalizedName;
      } else {
        nameInput.value = normalizedName;
      }
      setFieldError("gm-err-name", "");
      hideNameSuggestions();
    }

    if (periodInput) {
      periodInput.addEventListener("input", function () {
        periodInput.value = periodInput.value.replace(/[^\d]/g, "");
      });
    }

    if (nameInput) {
      nameInput.addEventListener("input", function () {
        if (!parseMembershipTypeNames(activeMembershipNameValue()).length) setFieldError("gm-err-name", "Membership Type Name is required");
        else setFieldError("gm-err-name", "");
        showNameSuggestions();
      });
      nameInput.addEventListener("focus", showNameSuggestions);
      nameInput.addEventListener("keydown", function (ev) {
        if (ev.key === "Escape") {
          hideNameSuggestions();
        }
      });
      nameInput.addEventListener("blur", function () {
        setTimeout(hideNameSuggestions, 120);
      });
    }

    if (nameSuggest) {
      nameSuggest.addEventListener("mousedown", function (ev) {
        ev.preventDefault();
      });
      nameSuggest.addEventListener("click", function (ev) {
        var target = ev.target && ev.target.closest ? ev.target.closest("[data-mt-suggest]") : null;
        if (!target) return;
        applyNameSuggestion(target.getAttribute("data-mt-suggest") || "");
      });
    }

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      hideNameSuggestions();
      var nameVal = activeMembershipNameValue();
      var parsedNames = parseMembershipTypeNames(nameVal);
      var periodVal = (periodInput && periodInput.value || "").trim();
      var editIdx = parseEditIndex(editIndexInput && editIndexInput.value);
      var isEditMode = isFinite(editIdx) && editIdx >= 0;

      setFieldError("gm-err-name", !parsedNames.length ? "Membership Type Name is required" : "");
      setFieldError("gm-err-period", /^\d+$/.test(periodVal) && Number(periodVal) > 0 ? "" : "No. of Days must be numeric");

      if ((qs("#gm-err-name", form).textContent || "").trim() || (qs("#gm-err-period", form).textContent || "").trim()) {
        form.classList.remove("gm-mt-shake");
        void form.offsetWidth;
        form.classList.add("gm-mt-shake");
        return;
      }

      var rows = getMembershipTypeRecords();
      var didUpdate = false;
      if (isFinite(editIdx) && editIdx >= 0 && editIdx < rows.length) {
        var nextRecord = {
          name: parsedNames[0],
          periodDays: periodVal,
          createdAt: new Date().toISOString(),
        };
        rows[editIdx] = nextRecord;
        didUpdate = true;
      } else {
        // For new saves, keep previous plans and add each new name as a separate record.
        var existingByNameAndDays = {};
        rows.forEach(function (row) {
          var n = String((row && row.name) || "").trim().toLowerCase();
          var d = String((row && row.periodDays) || "").trim();
          var key = n + "|" + d;
          if (n && d) existingByNameAndDays[key] = true;
        });

        var namesToAdd = parsedNames.filter(function (name) {
          var key = String(name || "").toLowerCase() + "|" + String(periodVal);
          return !existingByNameAndDays[key];
        });

        namesToAdd
          .slice()
          .reverse()
          .forEach(function (name) {
            rows.unshift({
              name: name,
              periodDays: periodVal,
              createdAt: new Date().toISOString(),
            });
          });

        if (!namesToAdd.length) {
          setFieldError("gm-err-name", "All entered Membership Type + Days pairs already exist");
          form.classList.remove("gm-mt-shake");
          void form.offsetWidth;
          form.classList.add("gm-mt-shake");
          return;
        }
      }
      saveMembershipTypeRecords(rows);
      notifyMembershipTypesUpdated();
      if (submitMsg) {
        submitMsg.textContent = didUpdate
          ? "Membership Type updated successfully."
          : parsedNames.length > 1
            ? "Membership Types saved successfully."
            : "Membership Type saved successfully.";
        submitMsg.classList.add("gm-mt-pop");
      }
      if (editIndexInput) editIndexInput.value = "";
      var submitBtn = qs('button[type="submit"]', form);
      if (submitBtn) submitBtn.textContent = "Save Membership Type";
      if (nameInput && !isEditMode) nameInput.value = "";
      if (periodInput && !isEditMode) periodInput.value = "";
      setTimeout(renderMembershipTypeContent, 220);
    });
  }

  function ensureMembershipTypeView() {
    if (!isMembershipTypeRoute(window.location.pathname)) {
      removeMembershipTypeView();
      return;
    }
    if (normalizePath(window.location.pathname) === "/membership-type/list") {
      history.replaceState({}, "", "/membership-type/add");
    }

    var root = qs("main") || qs("#root");
    if (!root) return;

    if (root.children && root.children.length) {
      Array.prototype.slice.call(root.children).forEach(function (el) {
        if (!el || el.id === "gm-membership-type-view") return;
        if (el.getAttribute("data-gm-mtype-hidden") === "1") return;
        el.setAttribute("data-gm-mtype-hidden", "1");
        el.setAttribute("data-gm-mtype-prev-display", el.style.display || "");
        el.style.display = "none";
      });
    }

    var view = qs("#gm-membership-type-view");
    if (!view) {
      view = document.createElement("section");
      view.id = "gm-membership-type-view";
      view.innerHTML = '<div id="gm-membership-type-panel">Loading...</div>';
      root.appendChild(view);
    }

    renderMembershipTypeContent();
  }

  function downloadCsvSampleTemplate() {
    var csv =
      [
        "Full Name,Phone Number,Start Date,End Date,Payment Mode,Duration",
        '"John Smith","+1-555-0100",2024-01-15,2025-01-15,Cash,12',
        '"Maria Garcia","+1-555-0101",2024-03-01,2024-09-01,Online,6',
        '"James Lee","+1-555-0102",2024-06-10,2024-09-10,Cash,3',
      ].join("\n");
    var blob = new Blob([csv], { type: "text/csv" });
    var href = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = href;
    a.download = "fitness-temple-import-template.csv";
    a.click();
    URL.revokeObjectURL(href);
  }

  function patchCsvImportDialogText() {
    if (!isMembersDashboardRoute(window.location.pathname)) return;

    var dialog = qsa('[role="dialog"]').find(function (el) {
      return /import\s*members\s*from\s*csv/i.test((el.textContent || "").trim());
    });
    if (!dialog) return;

    qsa("p,div,span", dialog).forEach(function (el) {
      var txt = (el.textContent || "").trim();
      if (!txt) return;

      if (/^accepted\s*formats:/i.test(txt) && /simple/i.test(txt)) {
        el.textContent = "Accepted formats: Simple (6 cols) or Fitness Temple export (8 cols)";
        return;
      }

      if (/^simple\s*format:/i.test(txt)) {
        el.textContent = CSV_SIMPLE_FORMAT_TEXT;
      }
    });
  }

  function bindCsvTemplateDownloadOverride() {
    if (csvTemplateHandlerBound) return;
    csvTemplateHandlerBound = true;

    document.addEventListener(
      "click",
      function (ev) {
        var btn = ev.target && ev.target.closest ? ev.target.closest("button") : null;
        if (!btn) return;
        var label = (btn.textContent || "").trim();
        if (/import\s*csv/i.test(label)) {
          setTimeout(patchCsvImportDialogText, 80);
          return;
        }
        if (!/download\s*sample\s*template/i.test(label)) return;
        ev.preventDefault();
        ev.stopPropagation();
        downloadCsvSampleTemplate();
      },
      true
    );
  }

  function ensureCsvImportModal() {
    if (qs("#gm-csv-import-modal")) return;
    var modal = document.createElement("div");
    modal.id = "gm-csv-import-modal";
    modal.className = "gm-csv-modal hidden";
    modal.innerHTML =
      '<div class="gm-csv-modal-backdrop" data-close="1"></div>' +
      '<div class="gm-csv-modal-card" role="dialog" aria-modal="true" aria-label="Import CSV">' +
      '<div class="gm-csv-modal-head">' +
      '<h3>Import Members from CSV</h3>' +
      '<button type="button" class="gm-csv-close" data-close="1">×</button>' +
      "</div>" +
      '<div class="gm-csv-modal-body">' +
      '<div class="gm-csv-title">CSV Import Format (6 columns)</div>' +
      '<div class="gm-csv-desc">Full Name, Phone Number, Start Date, End Date, Payment Mode, Duration</div>' +
      '<div class="gm-csv-desc">Date format must be YYYY-MM-DD. Payment Mode supports Cash or Online.</div>' +
      '<div class="gm-csv-actions">' +
      '<button type="button" id="gm-csv-select-btn" class="gm-csv-action-btn">Select CSV File</button>' +
      '<button type="button" id="gm-csv-template-btn" class="gm-csv-action-btn gm-csv-action-btn-secondary">Download Sample Template</button>' +
      '<input id="gm-csv-file-input" type="file" accept=".csv,text/csv" class="gm-hidden-file-input" />' +
      "</div>" +
      '<div id="gm-csv-upload-status" class="gm-csv-status">Choose a file to import members.</div>' +
      "</div>" +
      "</div>";
    document.body.appendChild(modal);
  }

  function openCsvImportModal() {
    ensureCsvImportModal();
    var modal = qs("#gm-csv-import-modal");
    if (!modal) return;
    modal.classList.remove("hidden");
  }

  function closeCsvImportModal() {
    var modal = qs("#gm-csv-import-modal");
    if (!modal) return;
    modal.classList.add("hidden");
  }

  function bindImportButtonToCsvModal() {
    if (!isMembersDashboardRoute(window.location.pathname)) return;
    var importBtn = qsa("button").find(function (btn) {
      return /import\s*csv/i.test((btn.textContent || "").trim());
    });
    if (!importBtn || importBtn.getAttribute("data-gm-modal-bound") === "1") return;
    importBtn.setAttribute("data-gm-modal-bound", "1");
    importBtn.addEventListener(
      "click",
      function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        openCsvImportModal();
      },
      true
    );
  }

  function ensureCsvFormatInDashboard() {
    if (!isMembersDashboardRoute(window.location.pathname)) return;
    bindImportButtonToCsvModal();
    ensureCsvImportModal();

    if (!csvQuickUploadBound) {
      csvQuickUploadBound = true;

      var selectBtn = qs("#gm-csv-select-btn");
      var templateBtn = qs("#gm-csv-template-btn");
      var input = qs("#gm-csv-file-input");
      var statusEl = qs("#gm-csv-upload-status");
      var modalEl = qs("#gm-csv-import-modal");

      if (modalEl) {
        modalEl.addEventListener("click", function (ev) {
          var closeTarget = ev.target && ev.target.closest ? ev.target.closest("[data-close='1']") : null;
          if (closeTarget) closeCsvImportModal();
        });
      }

      if (selectBtn && input) {
        selectBtn.addEventListener("click", function () {
          input.click();
        });
      }

      if (templateBtn) {
        templateBtn.addEventListener("click", function () {
          downloadCsvSampleTemplate();
        });
      }

      if (input) {
        input.addEventListener("change", function () {
          var file = input.files && input.files[0];
          if (!file) return;
          if (statusEl) statusEl.textContent = "Importing " + file.name + "...";

          var form = new FormData();
          form.append("csv", file);
          fetch("/api/members/import-csv", {
            method: "POST",
            body: form,
            credentials: "same-origin",
          })
            .then(function (resp) {
              return resp.json().then(function (data) {
                return { ok: resp.ok, data: data };
              });
            })
            .then(function (result) {
              if (!result.ok) {
                throw new Error((result.data && result.data.error) || "CSV import failed");
              }
              var d = result.data || {};
              if (statusEl) {
                statusEl.textContent =
                  "Import complete: " +
                  (d.imported || 0) +
                  " imported, " +
                  (d.skipped || 0) +
                  " skipped, out of " +
                  (d.total || 0) +
                  " rows.";
              }
              setTimeout(function () {
                closeCsvImportModal();
                window.location.reload();
              }, 500);
            })
            .catch(function (err) {
              if (statusEl) statusEl.textContent = "Import failed: " + (err.message || "Please check the CSV format.");
            })
            .finally(function () {
              input.value = "";
            });
        });
      }
    }
  }

  function ensureLogoutButton() {
    if (qs("#gm-logout-btn")) return;
    var btn = document.createElement("button");
    btn.id = "gm-logout-btn";
    btn.type = "button";
    btn.className = "gm-logout-btn";
    btn.textContent = "Logout";
    btn.addEventListener("click", function () {
      if (btn.getAttribute("data-gm-logout-busy") === "1") return;
      btn.setAttribute("data-gm-logout-busy", "1");
      btn.disabled = true;
      btn.textContent = "Logging out...";
      playLogoutOutro(function () {
        fetch("/api/auth/logout", {
          method: "POST",
          credentials: "same-origin",
        })
          .catch(function () {})
          .finally(function () {
            window.location.href = "/";
          });
      });
    });
    document.body.appendChild(btn);
  }

  function detectLoginBackgroundMediaType(file) {
    var mime = String((file && file.type) || "").toLowerCase();
    var name = String((file && file.name) || "").toLowerCase();
    if (mime.indexOf("video/") === 0) return "video";
    if (/\.(mp4|webm|ogg|mov|m4v)$/.test(name)) return "video";
    return "image";
  }

  function setLoginBackgroundToolStatus(root, message, isError) {
    var status = qs(".gm-login-bg-status", root);
    if (!status) return;
    status.textContent = String(message || "");
    status.classList.toggle("gm-error", !!isError);
  }

  function renderLoginBackgroundToolCurrent(root, payload) {
    var current = qs(".gm-login-bg-current", root);
    if (!current) return;
    var mediaType = payload && (payload.mediaType === "video" || payload.mediaType === "image") ? payload.mediaType : null;
    var mediaUrl = payload && payload.mediaUrl ? String(payload.mediaUrl) : "";
    if (mediaType && mediaUrl) {
      current.textContent = "Current: " + mediaType.toUpperCase() + " (" + mediaUrl.split("/").pop() + ")";
      return;
    }
    current.textContent = "Current: default animated background";
  }

  function parseApiResponseSafe(resp) {
    return resp.text().then(function (raw) {
      var parsed = {};
      if (raw) {
        try {
          parsed = JSON.parse(raw);
        } catch (_err) {
          parsed = { raw: raw };
        }
      }
      return { ok: !!resp.ok, status: resp.status, data: parsed || {} };
    });
  }

  function normalizeBasePrefix(prefix) {
    var v = String(prefix || "").trim();
    if (!v || v === "/") return "";
    if (v.charAt(0) !== "/") v = "/" + v;
    v = v.replace(/\/+$/, "");
    return v;
  }

  function deriveApiBasePrefixes() {
    var prefixes = [""];
    var patchEl = qs('script[src*="frontend-patch.js"]');
    var patchSrc = patchEl && patchEl.getAttribute ? String(patchEl.getAttribute("src") || "") : "";
    var cleanSrc = patchSrc.split("?")[0].split("#")[0];
    var idx = cleanSrc.indexOf("/frontend-patch.js");
    if (idx > 0) {
      prefixes.push(normalizeBasePrefix(cleanSrc.slice(0, idx)));
    }
    var path = normalizePath(window.location.pathname || "/");
    var parts = path.split("/").filter(Boolean);
    if (parts.length) {
      var acc = "";
      for (var i = 0; i < parts.length; i += 1) {
        acc += "/" + parts[i];
        prefixes.push(normalizeBasePrefix(acc));
      }
    }
    var seen = {};
    return prefixes.filter(function (p) {
      var key = String(p || "");
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  function toApiAuthLoginBackgroundCandidates() {
    var all = [];
    deriveApiBasePrefixes().forEach(function (base) {
      var root = base ? base : "";
      all.push(root + "/gm/login-background");
      all.push(root + "/gm/login-background/");
      all.push(root + "/api/auth/login-background");
      all.push(root + "/api/auth/login-background/");
      all.push(root + "/auth/login-background");
      all.push(root + "/auth/login-background/");
      all.push((root ? root + "/" : "") + "gm/login-background");
      all.push((root ? root + "/" : "") + "gm/login-background/");
      all.push((root ? root + "/" : "") + "api/auth/login-background");
      all.push((root ? root + "/" : "") + "api/auth/login-background/");
      all.push((root ? root + "/" : "") + "auth/login-background");
      all.push((root ? root + "/" : "") + "auth/login-background/");
    });
    var seen = {};
    return all.filter(function (u) {
      var key = String(u || "");
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }


  function fetchLoginBackgroundApi(method, body) {
    var endpoints = toApiAuthLoginBackgroundCandidates();
    var index = 0;

    function isHtmlResponseResult(result) {
      var raw = String(result && result.data && result.data.raw ? result.data.raw : "");
      return /<!doctype html|<html/i.test(raw);
    }

    function attempt() {
      var endpoint = endpoints[index];
      var opts = {
        method: method,
        credentials: "include",
      };
      if (typeof body !== "undefined") {
        opts.body = body;
        if (typeof body === "string") {
          opts.headers = { "Content-Type": "application/json" };
        }
      }

      return fetch(endpoint, opts).then(function (resp) {
        return parseApiResponseSafe(resp).then(function (result) {
          var shouldTryNext =
            index < endpoints.length - 1 &&
            (
              result.status === 404 ||
              // Some deployments return HTML 401/403 for non-API paths; keep probing.
              (result.status >= 400 && isHtmlResponseResult(result))
            );
          if (shouldTryNext) {
            index += 1;
            return attempt();
          }
          return result;
        });
      });
    }

    return attempt();
  }


  function apiResultErrorMessage(result, fallback) {
    var base = String(fallback || "Request failed");
    if (!result) return base;
    var data = result.data || {};
    if (data && data.error) return String(data.error);
    if (data && data.message) return String(data.message);
    var raw = String(data && data.raw ? data.raw : "").trim();
    if (raw) {
      if (/<!doctype html|<html/i.test(raw)) {
        if (Number(result.status) === 403) {
          return "Session/permission issue (HTTP 403). Please login again, then retry upload.";
        }
        return base + " (HTTP " + String(result.status || "error") + ", server returned HTML)";
      }
      return base + ": " + raw.slice(0, 140);
    }
    if (result.status) return base + " (HTTP " + String(result.status) + ")";
    return base;
  }

  function fetchLoginBackgroundToolCurrent(root) {
    fetchLoginBackgroundApi("GET")
      .then(function (result) {
        if (!result.ok) throw new Error(apiResultErrorMessage(result, "Unable to load login background"));
        renderLoginBackgroundToolCurrent(root, result.data);
      })
      .catch(function () {
        renderLoginBackgroundToolCurrent(root, null);
      });
  }

  function uploadLoginBackgroundFromTool(root, file) {
    if (!file) return;
    setLoginBackgroundToolStatus(root, "Uploading " + file.name + "...", false);
    var form = new FormData();
    form.append("file", file);
    form.append("mediaType", detectLoginBackgroundMediaType(file));
    fetchLoginBackgroundApi("POST", form)
      .then(function (result) {
        if (!result.ok) throw new Error(apiResultErrorMessage(result, "Upload failed"));
        renderLoginBackgroundToolCurrent(root, result.data);
        setLoginBackgroundToolStatus(root, "Saved. It will appear on the login page.", false);
      })
      .catch(function (err) {
        setLoginBackgroundToolStatus(root, "Upload failed: " + (err.message || "Unknown error"), true);
      });
  }

  function resetLoginBackgroundFromTool(root) {
    setLoginBackgroundToolStatus(root, "Resetting login background...", false);
    fetchLoginBackgroundApi("DELETE")
      .then(function (result) {
        if (!result.ok) throw new Error(apiResultErrorMessage(result, "Reset failed"));
        renderLoginBackgroundToolCurrent(root, null);
        setLoginBackgroundToolStatus(root, "Reset complete. Default login background restored.", false);
      })
      .catch(function (err) {
        setLoginBackgroundToolStatus(root, "Reset failed: " + (err.message || "Unknown error"), true);
      });
  }

  function bindLoginBackgroundTool(root) {
    if (!root || root.getAttribute("data-bound") === "1") return;
    root.setAttribute("data-bound", "1");
    var toggle = qs("#gm-login-bg-toggle", root);
    var panel = qs("#gm-login-bg-panel", root);
    var closeBtn = qs("#gm-login-bg-close", root);
    var chooseBtn = qs("#gm-login-bg-choose", root);
    var resetBtn = qs("#gm-login-bg-reset", root);
    var refreshBtn = qs("#gm-login-bg-refresh", root);
    var input = qs("#gm-login-bg-input", root);

    function setOpen(open) {
      if (!panel) return;
      panel.classList.toggle("gm-open", !!open);
      if (toggle) toggle.setAttribute("aria-expanded", open ? "true" : "false");
    }

    if (toggle) {
      toggle.addEventListener("click", function () {
        if (!panel) return;
        var willOpen = !panel.classList.contains("gm-open");
        setOpen(willOpen);
      });
    }
    if (closeBtn) closeBtn.addEventListener("click", function () { setOpen(false); });
    if (chooseBtn && input) {
      chooseBtn.addEventListener("click", function () { input.click(); });
    }
    if (refreshBtn) refreshBtn.addEventListener("click", function () { fetchLoginBackgroundToolCurrent(root); });
    if (input) {
      input.addEventListener("change", function () {
        var file = input.files && input.files[0];
        if (file) uploadLoginBackgroundFromTool(root, file);
        input.value = "";
      });
    }
    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        if (!window.confirm("Reset login background to default?")) return;
        resetLoginBackgroundFromTool(root);
      });
    }

    fetchLoginBackgroundToolCurrent(root);
  }

  function ensureLoginBackgroundTool() {
    var existing = qs("#" + LOGIN_BG_TOOL_ID);
    if (existing) {
      bindLoginBackgroundTool(existing);
      return;
    }
    var root = document.createElement("section");
    root.id = LOGIN_BG_TOOL_ID;
    root.className = "gm-login-bg-wrap";
    root.innerHTML =
      '<button type="button" id="gm-login-bg-toggle" class="gm-login-bg-btn" aria-expanded="false">Login BG</button>' +
      '<div id="gm-login-bg-panel" class="gm-login-bg-panel">' +
      '<div class="gm-login-bg-head"><strong>Login Background</strong><button type="button" id="gm-login-bg-close" class="gm-login-bg-close">x</button></div>' +
      '<p class="gm-login-bg-current">Loading...</p>' +
      '<div class="gm-login-bg-actions">' +
      '<button type="button" id="gm-login-bg-choose" class="gm-login-bg-action">Upload Image/Video</button>' +
      '<button type="button" id="gm-login-bg-reset" class="gm-login-bg-action gm-login-bg-action-danger">Reset</button>' +
      '<button type="button" id="gm-login-bg-refresh" class="gm-login-bg-action">Refresh</button>' +
      "</div>" +
      '<input id="gm-login-bg-input" type="file" class="gm-login-bg-input" accept="image/*,video/*" />' +
      '<p class="gm-login-bg-note">Applies only to the login page.</p>' +
      '<p class="gm-login-bg-status"></p>' +
      "</div>";
    document.body.appendChild(root);
    bindLoginBackgroundTool(root);
  }

  function generateLocalChatbotResponse(message) {
    var lowerMsg = String(message || "").toLowerCase();
    if (lowerMsg.includes("active") || lowerMsg.includes("member")) {
      return "Based on the current database, there are 2 active members. For more details, please check the members dashboard.";
    }
    if (lowerMsg.includes("expiry") || lowerMsg.includes("expire")) {
      return "Please check the members list for expiry dates. Members with upcoming expiries need renewal.";
    }
    if (lowerMsg.includes("renewal") || lowerMsg.includes("renew")) {
      return "Renewals can be processed through the member edit form. Update the membership duration as needed.";
    }
    return "I'm a simple local assistant. I can help with basic queries about members, expiry dates, and renewals. For complex questions, the AI service is temporarily unavailable.";
  }

  function chatbotScrollToBottom() {
    var msgs = qs("#gm-chatbot-messages");
    if (!msgs) return;
    msgs.scrollTop = msgs.scrollHeight;
  }

  function formatChatbotBotHtml(text) {
    var cleaned = String(text || "")
      .replace(/\r\n?/g, "\n")
      .replace(/\*\*/g, "")
      .trim();
    if (!cleaned) return "";

    var lines = cleaned.split("\n");
    var chunks = [];
    var inList = false;

    function closeList() {
      if (!inList) return;
      chunks.push("</ul>");
      inList = false;
    }

    lines.forEach(function (raw) {
      var line = String(raw || "").trim();
      if (!line) {
        closeList();
        chunks.push('<div class="gm-chat-spacer"></div>');
        return;
      }

      var listMatch = line.match(/^(?:[-*•]\s+|\d+[\.\)]\s+)(.+)$/);
      if (listMatch) {
        if (!inList) {
          chunks.push('<ul class="gm-chat-list">');
          inList = true;
        }
        chunks.push("<li>" + escapeHtml(listMatch[1].trim()) + "</li>");
        return;
      }

      closeList();

      if (/^[A-Za-z][A-Za-z0-9\s/&-]{1,70}:$/.test(line)) {
        chunks.push('<div class="gm-chat-heading">' + escapeHtml(line) + "</div>");
        return;
      }

      chunks.push('<div class="gm-chat-line">' + escapeHtml(line) + "</div>");
    });

    closeList();
    return chunks.join("");
  }

  function appendChatbotMessage(role, text) {
    var msgs = qs("#gm-chatbot-messages");
    if (!msgs) return;
    var row = document.createElement("div");
    row.className = "gm-chat-row " + (role === "user" ? "gm-chat-user" : "gm-chat-bot");
    var bubbleHtml =
      role === "bot"
        ? formatChatbotBotHtml(text)
        : String(escapeHtml(text || "")).replace(/\n/g, "<br>");
    row.innerHTML =
      '<div class="gm-chat-bubble">' +
      bubbleHtml +
      "</div>";
    msgs.appendChild(row);
    chatbotScrollToBottom();
  }

  function setChatbotLoading(loading) {
    var sendBtn = qs("#gm-chatbot-send");
    var input = qs("#gm-chatbot-input");
    if (sendBtn) {
      sendBtn.disabled = !!loading;
      sendBtn.textContent = loading ? "..." : "Send";
    }
    if (input) input.disabled = !!loading;
  }

  function chatbotAsk(message) {
    var text = String(message || "").trim();
    if (!text) return;
    var lowerText = text.toLowerCase();
    if (lowerText.includes("payment") || lowerText.includes("fee") || lowerText.includes("amount") || lowerText.includes("paid") || lowerText.includes("money") || lowerText.includes("cost") || lowerText.includes("price") || lowerText.includes("total")) {
      appendChatbotMessage("user", text);
      appendChatbotMessage("bot", "I'm sorry, I don't handle payment-related queries. Please ask about members, expiry dates, or renewals.");
      return;
    }
    appendChatbotMessage("user", text);
    chatbotHistory.push({ role: "user", text: text });
    setChatbotLoading(true);

    function postChatbot(url) {
      return fetch(url, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
    }

    var tried = [];
    postChatbot("/api/chatbot/query")
      .then(function (resp) {
        tried.push("/api/chatbot/query -> " + String(resp.status));
        if (resp.status === 404 || resp.status === 409) {
          return postChatbot("/api/chatbot/query/").then(function (resp2) {
            tried.push("/api/chatbot/query/ -> " + String(resp2.status));
            return resp2;
          });
        }
        return resp;
      })
      .then(function (resp) {
        return resp.json().then(function (data) {
          return { ok: resp.ok, data: data || {}, status: resp.status };
        });
      })
      .then(function (result) {
        var reply = "";
        if (!result.ok) {
          // Use local fallback for failed requests
          reply = generateLocalChatbotResponse(text);
          if (result.status === 503) {
            reply += "\n\nNote: The AI service is experiencing high demand and is temporarily unavailable.";
          }
        } else {
          reply = (result.data && result.data.answer) || "No answer generated.";
          if (result.data && result.data.warning) {
            reply += "\n\nNote: " + String(result.data.warning);
          } else if (result.data && result.data.provider === "local-fallback") {
            reply += "\n\nNote: Groq is unavailable right now, so local database fallback was used.";
          }
        }
        appendChatbotMessage("bot", reply);
        chatbotHistory.push({ role: "bot", text: reply });
      })
      .catch(function () {
        var msg = "Unable to reach chatbot service. Please try again.";
        appendChatbotMessage("bot", msg);
        chatbotHistory.push({ role: "bot", text: msg });
      })
      .finally(function () {
        setChatbotLoading(false);
        var input = qs("#gm-chatbot-input");
        if (input) {
          input.value = "";
          input.focus();
        }
      });
  }

  function bindChatbotUI() {
    var root = qs("#" + CHATBOT_ROOT_ID);
    if (!root || root.getAttribute("data-bound") === "1") return;
    root.setAttribute("data-bound", "1");

    var toggle = qs("#gm-chatbot-toggle", root);
    var closeBtn = qs("#gm-chatbot-close", root);
    var panel = qs("#gm-chatbot-panel", root);
    var form = qs("#gm-chatbot-form", root);

    function openPanel() {
      if (!panel) return;
      panel.classList.remove("hidden");
      if (toggle) toggle.setAttribute("aria-expanded", "true");
      chatbotScrollToBottom();
      var input = qs("#gm-chatbot-input");
      if (input) input.focus();
    }

    function closePanel() {
      if (!panel) return;
      panel.classList.add("hidden");
      if (toggle) toggle.setAttribute("aria-expanded", "false");
    }

    if (toggle) {
      toggle.addEventListener("click", function () {
        if (!panel) return;
        if (panel.classList.contains("hidden")) openPanel();
        else closePanel();
      });
    }
    if (closeBtn) closeBtn.addEventListener("click", closePanel);

    if (form) {
      form.addEventListener("submit", function (ev) {
        ev.preventDefault();
        var input = qs("#gm-chatbot-input");
        chatbotAsk(input ? input.value : "");
      });
    }
  }

  function ensureChatbot() {
    // Always ensure chatbot is present
    if (qs("#" + CHATBOT_ROOT_ID)) {
      bindChatbotUI();
      return;
    }

    var root = document.createElement("section");
    root.id = CHATBOT_ROOT_ID;
    root.className = "gm-chatbot-wrap";
    root.innerHTML =
      '<button type="button" id="gm-chatbot-toggle" aria-expanded="false" class="gm-chat-toggle">Ask AI</button>' +
      '<div id="gm-chatbot-panel" class="gm-chat-panel hidden">' +
      '<div class="gm-chat-head"><strong>Gym AI Assistant</strong><button type="button" id="gm-chatbot-close" class="gm-chat-close">x</button></div>' +
      '<div id="gm-chatbot-messages" class="gm-chat-messages"></div>' +
      '<form id="gm-chatbot-form" class="gm-chat-form">' +
      '<input id="gm-chatbot-input" type="text" placeholder="Ask member insights or general fitness questions..." autocomplete="off" />' +
      '<button id="gm-chatbot-send" type="submit">Send</button>' +
      "</form>" +
      "</div>";
    document.body.appendChild(root);

    appendChatbotMessage(
      "bot",
      "Ask about members, expiry dates, renewals, or general fitness topics. I combine local database insight with cloud AI when available."
    );
    bindChatbotUI();
  }

  function ensurePatchStyles() {
    if (qs("#gm-patch-styles")) return;
    var style = document.createElement("style");
    style.id = "gm-patch-styles";
    style.textContent =
      ":root{--gm-header-brand-size:14px;--gm-header-brand-line:1.2}" +
      ".gm-patch-enter{}" +
      ".gm-csv-format-note{margin:8px 0 0;padding:9px 12px;border-radius:10px;border:1px dashed rgba(56,189,248,.45);background:rgba(14,165,233,.08);color:#cbd5e1;font-size:12px;line-height:1.35}" +
      ".gm-csv-title{font-weight:700;color:#e2e8f0;margin-bottom:4px}" +
      ".gm-csv-desc{font-size:12px;line-height:1.4;color:#cbd5e1}" +
      ".gm-csv-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}" +
      ".gm-csv-action-btn{border:1px solid rgba(148,163,184,.45);background:rgba(15,23,42,.92);color:#e2e8f0;border-radius:8px;padding:6px 10px;font-size:12px;font-weight:600;cursor:pointer}" +
      ".gm-csv-action-btn:hover{border-color:rgba(56,189,248,.5);background:rgba(30,41,59,.95)}" +
      ".gm-csv-action-btn-secondary{background:rgba(2,6,23,.85)}" +
      ".gm-hidden-file-input{display:none}" +
      ".gm-csv-status{margin-top:8px;font-size:12px;color:#bae6fd}" +
      ".gm-csv-modal{position:fixed;inset:0;z-index:12000}" +
      ".gm-csv-modal.hidden{display:none}" +
      ".gm-csv-modal-backdrop{position:absolute;inset:0;background:rgba(2,6,23,.72)}" +
      ".gm-csv-modal-card{position:relative;width:min(680px,calc(100vw - 2rem));margin:9vh auto 0;background:#0f172a;border:1px solid rgba(148,163,184,.3);border-radius:14px;box-shadow:0 24px 80px rgba(0,0,0,.5);color:#e2e8f0;overflow:hidden}" +
      ".gm-csv-modal-head{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid rgba(148,163,184,.2)}" +
      ".gm-csv-modal-head h3{margin:0;font-size:16px;line-height:1.2}" +
      ".gm-csv-close{border:1px solid rgba(148,163,184,.35);background:rgba(15,23,42,.9);color:#e2e8f0;border-radius:8px;padding:2px 9px;font-size:20px;line-height:1;cursor:pointer}" +
      ".gm-csv-modal-body{padding:14px}" +
      ".gm-duration-label{display:block;font-size:13px;color:#cbd5e1}" +
      ".gm-duration-value{font-size:15px;font-weight:700;color:#7dd3fc}" +
      ".gm-money-wrap{display:flex;align-items:center;border:1px solid hsl(var(--input));border-radius:.75rem;overflow:hidden;background:hsl(var(--background));height:2.75rem}" +
      ".gm-money-prefix{height:100%;display:flex;align-items:center;padding:0 12px;border-right:1px solid hsl(var(--border));background:hsl(var(--muted)/.45);font-size:.8125rem;font-weight:700;color:hsl(var(--muted-foreground));letter-spacing:.03em}" +
      ".gm-money-input{flex:1;height:100%;border:0;background:transparent;padding:0 12px;font-size:.875rem;color:hsl(var(--foreground));outline:none}" +
      ".gm-money-wrap:focus-within{border-color:#06b6d4;box-shadow:0 0 0 4px rgba(6,182,212,.18)}" +
      "#gm-duration-range{width:100%;height:7px;border-radius:999px;outline:none;background:linear-gradient(90deg, rgba(56,189,248,.8), rgba(14,165,233,.45));appearance:none;-webkit-appearance:none}" +
      "#gm-duration-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:18px;height:18px;border-radius:50%;background:#0ea5e9;border:2px solid #e0f2fe;box-shadow:0 0 0 5px rgba(14,165,233,.2)}" +
      "#gm-duration-range::-moz-range-thumb{width:18px;height:18px;border-radius:50%;background:#0ea5e9;border:2px solid #e0f2fe;box-shadow:0 0 0 5px rgba(14,165,233,.2)}" +
      ".gm-duration-scale{display:flex;justify-content:space-between;font-size:11px;color:#94a3b8}" +
      "#gm-membership-type-view{width:100%}" +
      ".gm-membership-type-nav-btn{justify-content:flex-start!important;gap:.625rem!important}" +
      ".gm-membership-type-nav-btn > svg{flex-shrink:0;margin-right:0!important}" +
      ".gm-membership-type-nav-btn [data-gm-nav-label='membership-type']{margin-left:0!important;white-space:nowrap}" +
      ".gm-membership-type-nav-btn.gm-mtype-nav-active{background:hsl(var(--primary));color:hsl(var(--primary-foreground));box-shadow:0 10px 24px hsl(var(--primary)/.35)}" +
      ".gm-membership-type-nav-btn.gm-mtype-nav-active svg{color:inherit}" +
      ".gm-mt-shell{width:100%}" +
      ".gm-mt-fade-up{animation:gmMtFadeUp .48s cubic-bezier(.16,1,.3,1)}" +
      ".gm-mt-top-strip{height:72px;background:hsl(var(--card));border-bottom:1px solid hsl(var(--border));display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 20px}" +
      ".gm-mt-top-left{display:flex;align-items:center;gap:8px}" +
      ".gm-mt-top-icon{height:34px;width:34px;border-radius:10px;display:grid;place-items:center;background:hsl(var(--primary)/.14);color:hsl(var(--primary))}" +
      ".gm-mt-top-icon svg{width:17px;height:17px}" +
      ".gm-mt-top-title{font-size:var(--gm-header-brand-size);line-height:var(--gm-header-brand-line);font-weight:700;font-family:var(--app-font-display);color:hsl(var(--foreground));letter-spacing:-.025em}" +
      ".gm-mt-theme-btn{height:36px;width:36px;display:grid;place-items:center;padding:0;border:0;background:transparent;color:hsl(var(--primary));cursor:pointer;transition:transform .16s ease,opacity .16s ease}" +
      ".gm-mt-theme-btn:hover{opacity:.9;transform:translateY(-1px)}" +
      ".gm-mt-theme-btn:focus-visible{outline:none;box-shadow:0 0 0 3px hsl(var(--primary)/.25);border-radius:8px}" +
      ".dark .gm-mt-theme-btn{background:#0a1020;color:#6e56ff;border-radius:0;opacity:1;transform:none}" +
      ".dark .gm-mt-theme-btn:hover{background:#0f1830;opacity:1;transform:none}" +
      ".gm-mt-page{max-width:1280px;margin:0 auto;padding:16px}" +
      ".gm-mt-page-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:16px;padding-right:120px}" +
      ".gm-mt-page-head h1{margin:0;font-size:1.75rem;line-height:1.1;font-weight:600;color:hsl(var(--foreground))}" +
      ".gm-mt-breadcrumb{margin-top:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:.8125rem;color:hsl(var(--muted-foreground))}" +
      ".gm-mt-breadcrumb button{border:0;background:transparent;padding:0;color:hsl(var(--primary));cursor:pointer;font-weight:500}" +
      ".gm-mt-breadcrumb strong{color:hsl(var(--foreground))}" +
      ".gm-mt-card{background:linear-gradient(180deg,hsl(var(--card)) 0%,hsl(var(--card)/.97) 100%);transition:transform .2s ease,box-shadow .2s ease,border-color .2s ease}" +
      ".gm-mt-card:hover{transform:translateY(-2px);border-color:hsl(var(--primary)/.26);box-shadow:0 18px 46px hsl(var(--foreground)/.12)}" +
      ".gm-mt-form{display:flex;flex-direction:column;gap:18px}" +
      ".gm-mt-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}" +
      ".gm-mt-field{display:flex;flex-direction:column;gap:7px;position:relative}" +
      ".gm-mt-field-full{grid-column:1/-1}" +
      ".gm-mt-field label{font-size:.875rem;font-weight:500;color:hsl(var(--foreground))}" +
      ".gm-mt-field label span{color:#ef4444}" +
      ".gm-mt-name-wrap{position:relative}" +
      ".gm-mt-field input,.gm-mt-field select{width:100%;height:2.75rem;border-radius:.75rem;border:1px solid hsl(var(--input));background:hsl(var(--background));padding:0 .75rem;font-size:.875rem;color:hsl(var(--foreground));outline:none;box-shadow:0 1px 2px hsl(var(--foreground)/.05);transition:border-color .2s ease,box-shadow .2s ease,transform .2s ease,background-color .2s ease}" +
      ".gm-mt-field input:hover,.gm-mt-field select:hover{border-color:hsl(var(--primary)/.35);transform:translateY(-1px)}" +
      ".gm-mt-field input:focus,.gm-mt-field select:focus,.gm-mt-editor:focus{border-color:hsl(var(--ring));box-shadow:0 0 0 3px hsl(var(--ring)/.18),0 10px 24px hsl(var(--primary)/.16)}" +
      ".gm-mt-suggest{position:absolute;left:0;right:0;top:calc(100% + 8px);z-index:45;border:1px solid hsl(var(--border));border-radius:12px;background:hsl(var(--card));box-shadow:0 18px 42px hsl(var(--foreground)/.18);overflow:hidden;animation:gmMtSuggestIn .18s ease}" +
      ".gm-mt-suggest-item{width:100%;display:block;border:0;background:transparent;color:hsl(var(--foreground));text-align:left;padding:10px 12px;font-size:13px;font-weight:500;cursor:pointer;transition:background-color .16s ease,color .16s ease,padding-left .16s ease}" +
      ".gm-mt-suggest-item + .gm-mt-suggest-item{border-top:1px solid hsl(var(--border)/.6)}" +
      ".gm-mt-suggest-item:hover,.gm-mt-suggest-item:focus{background:hsl(var(--primary)/.12);color:hsl(var(--primary));padding-left:15px;outline:none}" +
      ".gm-mt-hidden{display:none!important}" +
      ".gm-mt-select-shell{position:relative;width:100%}" +
      ".gm-mt-select-shell input{padding-right:2.25rem!important}" +
      ".gm-mt-select-caret{position:absolute;right:.82rem;top:50%;width:.56rem;height:.56rem;border-right:2px solid hsl(var(--muted-foreground));border-bottom:2px solid hsl(var(--muted-foreground));transform:translateY(-58%) rotate(45deg);pointer-events:none;opacity:.92;transition:transform .2s ease,opacity .2s ease,border-color .2s ease}" +
      ".gm-mt-select-shell:hover .gm-mt-select-caret{opacity:1;border-color:#22d3ee}" +
      ".gm-mt-select-shell:focus-within .gm-mt-select-caret{transform:translateY(-42%) rotate(225deg);border-color:#06b6d4}" +
      "#gm-member-type-root .gm-mtype-shell{position:relative}" +
      "#gm-member-type-root .gm-mtype-native{position:absolute;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none}" +
      "#gm-member-type-root .gm-mtype-trigger{width:100%;height:2.75rem;border-radius:.75rem;border:1px solid hsl(var(--input));background:hsl(var(--background));padding:0 .75rem;display:flex;align-items:center;justify-content:space-between;gap:10px;color:hsl(var(--foreground));font-size:.875rem;outline:none;box-shadow:0 1px 2px hsl(var(--foreground)/.05);transition:border-color .2s ease,box-shadow .2s ease,transform .2s ease}" +
      "#gm-member-type-root .gm-mtype-trigger:hover{border-color:hsl(var(--primary)/.35);transform:translateY(-1px)}" +
      "#gm-member-type-root .gm-mtype-trigger:focus{border-color:hsl(var(--ring));box-shadow:0 0 0 3px hsl(var(--ring)/.18),0 10px 24px hsl(var(--primary)/.16)}" +
      "#gm-member-type-root .gm-mtype-trigger-placeholder{color:hsl(var(--muted-foreground))}" +
      "#gm-member-type-root .gm-mtype-caret{width:.56rem;height:.56rem;border-right:2px solid hsl(var(--muted-foreground));border-bottom:2px solid hsl(var(--muted-foreground));transform:rotate(45deg);transition:transform .2s ease,border-color .2s ease}" +
      "#gm-member-type-root .gm-mtype-shell.gm-open .gm-mtype-caret{transform:rotate(225deg);border-color:hsl(var(--primary))}" +
      "#gm-member-type-root .gm-mtype-menu{position:absolute;left:0;right:0;top:calc(100% + 8px);z-index:46;border:1px solid hsl(var(--border));border-radius:12px;background:hsl(var(--card));box-shadow:0 18px 42px hsl(var(--foreground)/.18);overflow:hidden;animation:gmMtSuggestIn .18s ease;max-height:260px;overflow-y:auto}" +
      "#gm-member-type-root .gm-mtype-item{width:100%;display:block;border:0;background:transparent;color:hsl(var(--foreground));text-align:left;padding:10px 12px;font-size:13px;font-weight:500;cursor:pointer;transition:background-color .16s ease,color .16s ease,padding-left .16s ease}" +
      "#gm-member-type-root .gm-mtype-item + .gm-mtype-item{border-top:1px solid hsl(var(--border)/.6)}" +
      "#gm-member-type-root .gm-mtype-item:hover,#gm-member-type-root .gm-mtype-item:focus{background:hsl(var(--primary)/.12);color:hsl(var(--primary));padding-left:15px;outline:none}" +
      "#gm-member-type-root .gm-mtype-item.gm-active{background:hsl(var(--primary)/.14);color:hsl(var(--primary))}" +
      "#gm-member-type-root .gm-mtype-item-placeholder{color:hsl(var(--muted-foreground))}" +
      "#gm-member-type-root .gm-member-mtype-select,#gm-member-type-root .gm-member-mtype-input{height:2.75rem;border-radius:.75rem;border:1px solid hsl(var(--input));background:hsl(var(--background));padding:0 .75rem;font-size:.875rem;color:hsl(var(--foreground));outline:none;transition:border-color .2s ease,box-shadow .2s ease,transform .2s ease}" +
      "#gm-member-type-root .gm-member-mtype-select:hover,#gm-member-type-root .gm-member-mtype-input:hover{transform:translateY(-1px)}" +
      "#gm-member-type-root .gm-member-mtype-select:focus,#gm-member-type-root .gm-member-mtype-input:focus{border-color:#06b6d4;box-shadow:0 0 0 4px rgba(6,182,212,.18)}" +
      ".gm-mt-inline{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center}" +
      ".gm-mt-inline-grid{grid-column:1/-1;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;padding:12px;border-radius:14px;background:hsl(var(--muted)/.25);border:1px solid hsl(var(--border))}" +
      ".gm-mt-inline-grid.gm-mt-disabled{opacity:.55}" +
      ".gm-mt-radios{display:flex;align-items:center;gap:18px;min-height:44px}" +
      ".gm-mt-radios label{display:inline-flex;align-items:center;gap:8px;font-weight:500;font-size:.875rem;color:hsl(var(--foreground))}" +
      ".gm-mt-money{display:flex;align-items:center;height:2.75rem;border-radius:.75rem;border:1px solid hsl(var(--input));background:hsl(var(--background));overflow:hidden}" +
      ".gm-mt-money span{height:100%;display:flex;align-items:center;padding:0 12px;background:hsl(var(--muted)/.45);color:hsl(var(--muted-foreground));font-weight:600;border-right:1px solid hsl(var(--border))}" +
      ".gm-mt-money input{border:0!important;box-shadow:none!important;background:transparent!important;flex:1;padding:0 12px;height:100%}" +
      ".gm-mt-installment{display:grid;grid-template-columns:minmax(140px,220px) 1fr auto;gap:10px;align-items:center}" +
      ".gm-mt-outline-btn{height:2.75rem;padding:0 14px;border-radius:.75rem;border:1px solid hsl(var(--input));background:hsl(var(--background));color:hsl(var(--foreground));font-size:.8125rem;font-weight:600;cursor:pointer;transition:all .2s ease}" +
      ".gm-mt-outline-btn:hover{transform:scale(1.03);box-shadow:0 0 0 4px rgba(6,182,212,.16)}" +
      ".gm-mt-editor-wrap{border:1px solid hsl(var(--input));border-radius:14px;background:hsl(var(--background));overflow:hidden}" +
      ".gm-mt-toolbar{display:flex;gap:6px;flex-wrap:wrap;padding:10px;border-bottom:1px solid hsl(var(--border));background:hsl(var(--muted)/.25)}" +
      ".gm-mt-toolbar button{height:32px;min-width:36px;padding:0 10px;border-radius:9px;border:1px solid hsl(var(--input));background:hsl(var(--background));font-size:12px;font-weight:600;color:hsl(var(--foreground));cursor:pointer;transition:all .2s ease}" +
      ".gm-mt-toolbar button:hover{transform:translateY(-1px);border-color:#7dd3fc;box-shadow:0 10px 18px rgba(14,165,233,.18)}" +
      ".gm-mt-editor{min-height:140px;padding:12px;outline:none;font-size:14px;color:hsl(var(--foreground));background:hsl(var(--background))}" +
      ".gm-mt-editor blockquote{margin:8px 0;padding-left:10px;border-left:4px solid hsl(var(--primary));color:hsl(var(--muted-foreground))}" +
      ".gm-mt-actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap}" +
      ".gm-mt-primary-btn{height:2.75rem;padding:0 16px;border:1px solid hsl(var(--primary)/.45);border-radius:.75rem;background:hsl(var(--primary));color:hsl(var(--primary-foreground));font-size:.875rem;font-weight:700;cursor:pointer;box-shadow:0 8px 24px hsl(var(--primary)/.28);transition:transform .18s ease,box-shadow .18s ease,filter .2s ease}" +
      ".gm-mt-primary-btn:hover{transform:translateY(-1px);filter:brightness(1.03);box-shadow:0 12px 30px hsl(var(--primary)/.34)}" +
      ".gm-mt-primary-btn:active{transform:translateY(0)}" +
      ".gm-mt-small{height:40px}" +
      ".gm-mt-hint{margin-top:6px;font-size:12px;color:hsl(var(--muted-foreground))}" +
      ".gm-mt-error{min-height:0;max-height:0;overflow:hidden;opacity:0;transform:translateY(-3px);transition:all .2s ease;font-size:12px;color:#ef4444;background:#fff1f2;border-radius:8px;padding:0 8px}" +
      ".gm-mt-error-show{min-height:24px;max-height:50px;opacity:1;transform:translateY(0);padding:5px 8px;animation:gmMtPop .2s ease}" +
      ".gm-mt-success{font-size:13px;color:hsl(var(--primary));font-weight:600}" +
      ".gm-mt-pop{animation:gmMtPop .25s ease}" +
      ".gm-mt-table-wrap{overflow:auto;border:1px solid hsl(var(--border));border-radius:14px}" +
      ".gm-mt-table{width:100%;border-collapse:collapse;min-width:760px;background:hsl(var(--card));color:hsl(var(--card-foreground))}" +
      ".gm-mt-table th{padding:11px 10px;text-align:left;font-size:12px;letter-spacing:.01em;color:hsl(var(--muted-foreground));background:hsl(var(--muted)/.25);border-bottom:1px solid hsl(var(--border))}" +
      ".gm-mt-td{padding:11px 10px;font-size:13px;color:hsl(var(--foreground));border-bottom:1px solid hsl(var(--border))}" +
      ".gm-mt-empty{text-align:center;padding:34px 12px;font-size:13px;color:hsl(var(--muted-foreground))}" +
      ".gm-mt-link-btn{border:1px solid hsl(var(--input));background:hsl(var(--background));color:hsl(var(--foreground));border-radius:8px;padding:6px 10px;font-size:12px;font-weight:600;cursor:pointer}" +
      ".gm-mt-link-btn:hover{background:hsl(var(--muted)/.35)}" +
      ".gm-mt-link-btn-danger{border-color:#ef4444;color:#ef4444}" +
      ".gm-mt-link-btn-danger:hover{background:rgba(239,68,68,.1)}" +
      ".gm-mt-shake{animation:gmMtShake .28s ease}" +
      "@keyframes gmMtFadeUp{0%{opacity:0;transform:translateY(14px)}100%{opacity:1;transform:translateY(0)}}" +
      "@keyframes gmMtSuggestIn{0%{opacity:0;transform:translateY(-6px) scale(.98)}100%{opacity:1;transform:translateY(0) scale(1)}}" +
      "@keyframes gmMtPop{0%{opacity:.7;transform:scale(.96)}100%{opacity:1;transform:scale(1)}}" +
      "@keyframes gmMtShake{0%,100%{transform:translateX(0)}30%{transform:translateX(-3px)}60%{transform:translateX(3px)}}" +
      "@media (max-width:920px){.gm-mt-top-strip{height:64px;padding:0 14px}.gm-mt-theme-btn{height:34px;width:34px}.gm-mt-top-title{font-size:var(--gm-header-brand-size)}.gm-mt-page-head{padding-right:0}.gm-mt-page-head h1{font-size:1.5rem}.gm-mt-grid{grid-template-columns:1fr}.gm-mt-installment{grid-template-columns:1fr}.gm-mt-inline{grid-template-columns:1fr}.gm-mt-inline-grid{grid-template-columns:1fr}}"+
      ".gm-chatbot-wrap{position:fixed;right:16px;bottom:16px;z-index:10020}" +
      ".gm-chat-toggle{height:44px;padding:0 14px;border-radius:999px;border:1px solid hsl(var(--primary)/.35);background:hsl(var(--primary));color:hsl(var(--primary-foreground));font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 12px 34px hsl(var(--primary)/.28)}" +
      ".gm-chat-panel{position:absolute;right:0;bottom:54px;width:min(360px,calc(100vw - 24px));height:470px;border:1px solid hsl(var(--border));border-radius:14px;background:hsl(var(--card));color:hsl(var(--card-foreground));display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 80px hsl(var(--foreground)/.2)}" +
      ".gm-chat-panel.hidden{display:none}" +
      ".gm-chat-head{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid hsl(var(--border));background:hsl(var(--muted)/.2)}" +
      ".gm-chat-close{border:1px solid hsl(var(--input));background:hsl(var(--background));color:hsl(var(--foreground));border-radius:8px;padding:2px 8px;font-size:12px;cursor:pointer}" +
      ".gm-chat-messages{flex:1;overflow:auto;padding:10px;display:flex;flex-direction:column;gap:8px}" +
      ".gm-chat-row{display:flex}" +
      ".gm-chat-user{justify-content:flex-end}" +
      ".gm-chat-bot{justify-content:flex-start}" +
      ".gm-chat-bubble{max-width:88%;padding:8px 10px;border-radius:12px;font-size:12.5px;line-height:1.45;border:1px solid hsl(var(--border));background:hsl(var(--muted)/.35);color:hsl(var(--foreground))}" +
      ".gm-chat-line{margin:0 0 6px}" +
      ".gm-chat-line:last-child{margin-bottom:0}" +
      ".gm-chat-heading{margin:2px 0 7px;font-weight:700;letter-spacing:.01em}" +
      ".gm-chat-list{margin:4px 0 8px 18px;padding:0}" +
      ".gm-chat-list li{margin:0 0 4px}" +
      ".gm-chat-list li:last-child{margin-bottom:0}" +
      ".gm-chat-spacer{height:7px}" +
      ".gm-chat-user .gm-chat-bubble{background:hsl(var(--primary)/.16);border-color:hsl(var(--primary)/.35);color:hsl(var(--foreground))}" +
      ".gm-chat-form{display:grid;grid-template-columns:1fr auto;gap:8px;padding:10px;border-top:1px solid hsl(var(--border));background:hsl(var(--card))}" +
      ".gm-chat-form input{height:38px;border-radius:10px;border:1px solid hsl(var(--input));background:hsl(var(--background));color:hsl(var(--foreground));padding:0 10px;font-size:12.5px;outline:none}" +
      ".gm-chat-form input:focus{border-color:hsl(var(--ring));box-shadow:0 0 0 3px hsl(var(--ring)/.22)}" +
      ".gm-chat-form button{height:38px;padding:0 12px;border-radius:10px;border:1px solid hsl(var(--primary)/.45);background:hsl(var(--primary));color:hsl(var(--primary-foreground));font-size:12px;font-weight:700;cursor:pointer}" +
      ".gm-chat-form button:disabled{opacity:.7;cursor:not-allowed}" +
      ".gm-logout-btn{position:fixed;top:14px;right:70px;z-index:9999;border:1px solid hsl(var(--border));background:hsl(var(--card)/.92);color:hsl(var(--foreground));border-radius:10px;padding:8px 12px;font-size:12px;font-weight:600;backdrop-filter:blur(8px);box-shadow:0 10px 28px hsl(var(--foreground)/.15);transition:all .2s ease}" +
      ".gm-logout-btn:hover{border-color:hsl(var(--primary)/.5);color:hsl(var(--primary));background:hsl(var(--primary)/.08)}" +
      ".gm-logout-btn:disabled{opacity:.7;cursor:not-allowed}" +
      ".gm-login-bg-btn{position:fixed;top:14px;right:146px;z-index:9999;border:1px solid hsl(var(--border));background:hsl(var(--card)/.92);color:hsl(var(--foreground));border-radius:10px;padding:8px 12px;font-size:12px;font-weight:600;backdrop-filter:blur(8px);box-shadow:0 10px 28px hsl(var(--foreground)/.15);transition:all .2s ease}" +
      ".gm-login-bg-btn:hover{border-color:hsl(var(--primary)/.5);color:hsl(var(--primary));background:hsl(var(--primary)/.08)}" +
      ".gm-login-bg-panel{position:fixed;top:56px;right:14px;z-index:10002;width:min(340px,calc(100vw - 20px));display:none;border:1px solid hsl(var(--border));border-radius:12px;background:hsl(var(--card)/.98);color:hsl(var(--foreground));box-shadow:0 18px 56px hsl(var(--foreground)/.2);padding:10px}" +
      ".gm-login-bg-panel.gm-open{display:block}" +
      ".gm-login-bg-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}" +
      ".gm-login-bg-close{height:26px;width:26px;border:1px solid hsl(var(--input));background:hsl(var(--background));color:hsl(var(--foreground));border-radius:8px;cursor:pointer}" +
      ".gm-login-bg-current{margin:4px 0 8px;font-size:12px;color:hsl(var(--muted-foreground));word-break:break-word}" +
      ".gm-login-bg-actions{display:flex;gap:6px;flex-wrap:wrap}" +
      ".gm-login-bg-action{height:30px;padding:0 10px;border:1px solid hsl(var(--input));background:hsl(var(--background));color:hsl(var(--foreground));border-radius:8px;font-size:12px;font-weight:600;cursor:pointer}" +
      ".gm-login-bg-action:hover{border-color:hsl(var(--primary)/.45);color:hsl(var(--primary))}" +
      ".gm-login-bg-action-danger:hover{border-color:rgba(239,68,68,.5);color:#ef4444}" +
      ".gm-login-bg-input{display:none}" +
      ".gm-login-bg-note{margin:8px 0 4px;font-size:11px;color:hsl(var(--muted-foreground))}" +
      ".gm-login-bg-status{min-height:14px;margin:0;font-size:11px;color:#16a34a}" +
      ".gm-login-bg-status.gm-error{color:#ef4444}" +      "@media (max-width:860px){main{padding:12px!important}section.rounded-2xl{padding:14px!important;border-radius:14px!important}.gm-date-wrap{flex-wrap:wrap}.gm-date-wrap .gm-date-input{min-width:0}.gm-date-wrap .gm-date-today,.gm-date-wrap .gm-date-clear{flex:1 1 46%}#gm-duration-scrollbar-root .gm-duration-scale{font-size:10px}#gm-member-type-root .grid.sm\\:grid-cols-2{display:grid;grid-template-columns:1fr!important;gap:12px!important}.gm-csv-modal-card{width:min(680px,calc(100vw - 1rem));margin:4vh auto 0}.gm-chat-panel{height:min(68vh,510px)}}"+
      "@media (max-width:640px){:root{--gm-header-brand-size:13px;--gm-header-brand-line:1.15}main{padding:10px!important}.gm-logout-btn{right:10px;top:10px;padding:7px 10px;font-size:11px}.gm-login-bg-btn{right:90px;top:10px;padding:7px 10px;font-size:11px}.gm-login-bg-panel{right:8px;top:50px;width:min(340px,calc(100vw - 16px))}.gm-chatbot-wrap{right:10px;bottom:10px}.gm-chat-toggle{height:40px;padding:0 12px;font-size:12px}.gm-chat-panel{right:0;bottom:48px;width:min(380px,calc(100vw - 12px));height:min(66vh,500px)}.gm-chat-form{grid-template-columns:1fr}.gm-chat-form button{width:100%}.gm-money-wrap{height:2.6rem}.gm-money-prefix{padding:0 10px}.gm-money-input{font-size:13px}#gm-membership-type-view .gm-mt-page{padding:10px}#gm-membership-type-view .gm-mt-card{padding:12px!important}#gm-membership-type-view .gm-mt-table{min-width:600px}}"+
      "@media (max-width:420px){main{padding:8px!important}.gm-logout-btn,.gm-login-bg-btn{padding:6px 8px;font-size:10px;border-radius:8px}.gm-login-bg-btn{right:78px}.gm-chat-panel{width:calc(100vw - 8px);right:-2px}.gm-duration-scale span{font-size:9px}.gm-csv-modal-card{width:calc(100vw - .5rem)}table{display:block;overflow-x:auto;-webkit-overflow-scrolling:touch}}"+
      "html[data-gm-phone-layout='1'],html[data-gm-phone-layout='1'] body,#root{max-width:100%;overflow-x:hidden}";
    document.head.appendChild(style);
  }

  function ensureTopHeaderFontSize() {
    var rootStyles = window.getComputedStyle(document.documentElement);
    var size = (rootStyles.getPropertyValue("--gm-header-brand-size") || "14px").trim();
    var lineHeight = (rootStyles.getPropertyValue("--gm-header-brand-line") || "1.2").trim();
    qsa("header span, header p, nav span, nav p").forEach(function (el) {
      var text = (el.textContent || "").trim();
      if (text === "Fitness Temple" || text === "Membership Type") {
        el.style.fontSize = size;
        el.style.lineHeight = lineHeight;
      }
    });
  }

  function ensureAppTransitionStyles() {
    if (qs("#gm-app-transition-styles")) return;
    var style = document.createElement("style");
    style.id = "gm-app-transition-styles";
    style.textContent =
      "#gm-route-transition{display:none!important;opacity:0!important;visibility:hidden!important;pointer-events:none!important}" +
      "#gm-route-transition .gm-route-veil,#gm-route-transition .gm-route-flare{display:none!important;opacity:0!important}" +
      "#root.gm-page-enter{animation:gmPageEnter .42s cubic-bezier(.16,1,.3,1)}" +
      "#gm-logout-outro{position:fixed;inset:0;z-index:12050;pointer-events:none;opacity:0}" +
      "#gm-logout-outro.gm-active{opacity:1}" +
      "#gm-logout-outro .gm-logout-veil{position:absolute;inset:0;background:radial-gradient(circle at 18% 20%, rgba(124,92,255,.52), transparent 42%),radial-gradient(circle at 82% 78%, rgba(92,157,255,.48), transparent 44%),linear-gradient(145deg, #030513 0%, #06091a 55%, #090f23 100%);transform:scale(1.06)}" +
      "#gm-logout-outro .gm-logout-title{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) scale(.92);color:#dce6ff;font-size:clamp(1rem,3.5vw,1.6rem);font-weight:800;letter-spacing:.08em;text-transform:uppercase;opacity:0}" +
      "#gm-logout-outro.gm-active .gm-logout-veil{animation:gmLogoutVeil .72s cubic-bezier(.16,1,.3,1) forwards}" +
      "#gm-logout-outro.gm-active .gm-logout-title{animation:gmLogoutTitle .72s ease forwards}" +
      "@keyframes gmPageEnter{0%{opacity:.72;transform:translateY(8px) scale(.995)}100%{opacity:1;transform:translateY(0) scale(1)}}" +
      "@keyframes gmLogoutVeil{0%{opacity:0;transform:scale(1.08)}30%{opacity:1}100%{opacity:1;transform:scale(1)}}" +
      "@keyframes gmLogoutTitle{0%{opacity:0;transform:translate(-50%,-50%) scale(.9)}38%{opacity:1;transform:translate(-50%,-50%) scale(1)}100%{opacity:.86;transform:translate(-50%,-50%) scale(1)}}";
    document.head.appendChild(style);
  }

  function ensureRouteTransitionLayer() {
    var existing = qs("#gm-route-transition");
    if (existing) return existing;
    var layer = document.createElement("div");
    layer.id = "gm-route-transition";
    layer.setAttribute("aria-hidden", "true");
    layer.innerHTML = '<div class="gm-route-veil"></div><div class="gm-route-flare"></div>';
    document.body.appendChild(layer);
    return layer;
  }

  function animateRootEntry() {
    var root = qs("#root");
    if (!root) return;
    root.classList.remove("gm-page-enter");
    void root.offsetWidth;
    root.classList.add("gm-page-enter");
  }

  function ensureLogoutOutroLayer() {
    var existing = qs("#gm-logout-outro");
    if (existing) return existing;
    var layer = document.createElement("div");
    layer.id = "gm-logout-outro";
    layer.setAttribute("aria-hidden", "true");
    layer.innerHTML =
      '<div class="gm-logout-veil"></div><div class="gm-logout-title">Signing Out</div>';
    document.body.appendChild(layer);
    return layer;
  }

  function playLogoutOutro(done) {
    ensureAppTransitionStyles();
    var layer = ensureLogoutOutroLayer();
    if (!layer) {
      if (typeof done === "function") done();
      return;
    }
    layer.classList.remove("gm-active");
    void layer.offsetWidth;
    layer.classList.add("gm-active");
    setTimeout(function () {
      if (typeof done === "function") done();
    }, 620);
  }

  function playRouteTransition(isLight) {
    // Removed flashy veil and flare animations for smooth transition
    animateRootEntry();
  }

  function playPostLoginEntryTransition() {
    var shouldAnimate = false;
    try {
      shouldAnimate = sessionStorage.getItem("gm.enter.after.login") === "1";
    } catch (_err) {
      shouldAnimate = false;
    }
    if (!shouldAnimate) return;
    try {
      sessionStorage.removeItem("gm.enter.after.login");
    } catch (_err2) {}
    playRouteTransition(false);
  }

  function isValidIsoDateString(value) {
    var v = String(value || "").trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(v);
  }

  function safeMemberString(value, fallback) {
    var text = String(value == null ? "" : value).trim();
    return text || String(fallback || "");
  }

  function normalizeMembersListPayload(data) {
    if (!data || typeof data !== "object" || !Array.isArray(data.members)) return data;

    var payload = data;
    var today = todayIso();
    var normalizedMembers = payload.members.map(function (member, index) {
      var row = member && typeof member === "object" ? member : {};
      var startDate = isValidIsoDateString(row.membershipStartDate) ? String(row.membershipStartDate).slice(0, 10) : today;
      var endDate = isValidIsoDateString(row.membershipEndDate) ? String(row.membershipEndDate).slice(0, 10) : startDate;
      var durationMonths = Number(row.membershipDurationMonths);
      var daysRemaining = Number(row.daysRemaining);
      var status = safeMemberString(row.status, "active").toLowerCase();

      if (!isFinite(durationMonths) || durationMonths <= 0) durationMonths = 1;
      if (!isFinite(daysRemaining)) daysRemaining = 0;
      if (status !== "active" && status !== "expiring_soon" && status !== "expired") status = "active";

      return {
        id: typeof row.id !== "undefined" ? row.id : index + 1,
        memberId: safeMemberString(row.memberId, "GYM-" + String(index + 1).padStart(4, "0")),
        fullName: safeMemberString(row.fullName, "Member"),
        phoneNumber: safeMemberString(row.phoneNumber, ""),
        profilePhotoUrl: row.profilePhotoUrl || null,
        membershipStartDate: startDate,
        membershipEndDate: endDate,
        membershipDurationMonths: durationMonths,
        membershipDurationDays: row.membershipDurationDays,
        status: status,
        daysRemaining: Math.round(daysRemaining),
        paymentMode: safeMemberString(row.paymentMode, "Cash"),
        paymentReceived: typeof row.paymentReceived !== "undefined" ? row.paymentReceived : 0,
      };
    });

    var total = Number(payload.total);
    var page = Number(payload.page);
    var totalPages = Number(payload.totalPages);
    if (!isFinite(total) || total < 0) total = normalizedMembers.length;
    if (!isFinite(page) || page < 1) page = 1;
    if (!isFinite(totalPages) || totalPages < 1) totalPages = 1;

    var nextPayload = {};
    Object.keys(payload).forEach(function (key) {
      nextPayload[key] = payload[key];
    });
    nextPayload.members = normalizedMembers;
    nextPayload.total = total;
    nextPayload.page = page;
    nextPayload.totalPages = totalPages;
    return nextPayload;
  }

  var originalFetch = window.fetch;
  window.fetch = function (input, init) {
    var url = typeof input === "string" ? input : (input && input.url) || "";
    var cleanUrl = String(url || "").split("#")[0];
    var urlPath = cleanUrl.split("?")[0];
    var opts = init || {};
    var inputMethod = input && typeof input === "object" && input.method ? String(input.method) : "";
    var method = ((opts.method || inputMethod || "GET") + "").toUpperCase();
    var isMembersWriteEndpoint = /\/api\/members\/?(?:\d+\/?)?$/.test(urlPath);
    var isMembersListEndpoint = /\/api\/members\/?$/.test(urlPath);

    if (isMembersWriteEndpoint && (method === "POST" || method === "PUT")) {
      ensureExtraFields();
      ensureMembershipStartDateDefaultForNewMember();
      var body = opts.body;
      var payment = qs("#gm-payment-mode");
      var joining = qs("#gm-date-joining");
      var deposit = qs("#gm-deposit-date");
      var paymentReceived = qs("#gm-payment-received");
      var durationInput = qs("#gm-duration-input");
      var typeDurationInput = qs("#gm-member-mtype-duration-months");
      var periodDays = getCurrentMemberTypePeriodDays();
      if (body && typeof FormData !== "undefined" && body instanceof FormData) {
        body.set("paymentMode", payment && payment.value ? payment.value : "cash");
        body.set("paymentReceived", paymentReceived && paymentReceived.value ? paymentReceived.value : "0");
        if (joining && joining.value) body.set("dateOfJoining", joining.value);
        else if (body.get("membershipStartDate")) body.set("dateOfJoining", String(body.get("membershipStartDate")));
        if (deposit && deposit.value) body.set("depositDate", deposit.value);
        else body.delete("depositDate");
        if (typeDurationInput && typeDurationInput.value) body.set("membershipDurationMonths", typeDurationInput.value);
        else if (durationInput && durationInput.value) body.set("membershipDurationMonths", durationInput.value);
        else body.set("membershipDurationMonths", "1");
        if (isFinite(periodDays) && periodDays > 0) body.set("membershipDurationDays", String(Math.round(periodDays)));
        else body.delete("membershipDurationDays");
        if (method === "POST") {
          if (joining && joining.value) body.set("membershipStartDate", joining.value);
          else if (!body.get("membershipStartDate")) body.set("membershipStartDate", todayIso());
        }
      } else if (typeof body === "string") {
        var jsonBody = null;
        try {
          jsonBody = JSON.parse(body);
        } catch (_err) {
          jsonBody = null;
        }
        if (jsonBody && typeof jsonBody === "object") {
          if (!jsonBody.paymentMode) jsonBody.paymentMode = payment && payment.value ? payment.value : "cash";
          if (typeof jsonBody.paymentReceived === "undefined") {
            jsonBody.paymentReceived = paymentReceived && paymentReceived.value ? paymentReceived.value : "0";
          }
          if (!jsonBody.dateOfJoining) {
            if (joining && joining.value) jsonBody.dateOfJoining = joining.value;
            else if (jsonBody.membershipStartDate) jsonBody.dateOfJoining = String(jsonBody.membershipStartDate);
          }
          if (deposit && deposit.value) jsonBody.depositDate = deposit.value;
          if (typeDurationInput && typeDurationInput.value) jsonBody.membershipDurationMonths = typeDurationInput.value;
          else if (durationInput && durationInput.value) jsonBody.membershipDurationMonths = durationInput.value;
          else if (!jsonBody.membershipDurationMonths) jsonBody.membershipDurationMonths = "1";
          if (isFinite(periodDays) && periodDays > 0) jsonBody.membershipDurationDays = String(Math.round(periodDays));
          else delete jsonBody.membershipDurationDays;
          if (method === "POST" && !jsonBody.membershipStartDate) {
            jsonBody.membershipStartDate = joining && joining.value ? joining.value : todayIso();
          }
          opts.body = JSON.stringify(jsonBody);
        }
      }
    }

    var responsePromise = originalFetch.call(this, input, opts);
    if (isMembersListEndpoint && method === "GET") {
      responsePromise = responsePromise.then(function (resp) {
        if (!resp || !resp.ok) return resp;
        var contentType = String((resp.headers && resp.headers.get && resp.headers.get("content-type")) || "").toLowerCase();
        if (contentType.indexOf("json") < 0) return resp;

        return resp
          .clone()
          .json()
          .then(function (data) {
            var normalized = normalizeMembersListPayload(data);
            rememberMembersPayload(normalized);
            membershipTypeData = normalized;
            scheduleDashboardDecorate();
            ensureCsvFormatInDashboard();
            if (isMembershipTypeRoute(window.location.pathname)) renderMembershipTypeContent();

            if (typeof Response === "undefined" || typeof Headers === "undefined") return resp;
            var headers = new Headers(resp.headers || {});
            headers.set("content-type", "application/json");
            headers.delete("content-length");
            return new Response(JSON.stringify(normalized), {
              status: resp.status,
              statusText: resp.statusText,
              headers: headers,
            });
          })
          .catch(function () {
            return resp;
          });
      });
    }
    return responsePromise;
  };

  function safeCall(fn) {
    try {
      fn();
    } catch (_err) {}
  }

  function enforceMemberFormLayoutStability() {
    if (!isMemberFormRoute(window.location.pathname)) {
      if (memberFormTimer) {
        clearTimeout(memberFormTimer);
        memberFormTimer = null;
      }
      return;
    }
    if (memberFormTimer) return;
    var runs = 0;
    var maxRuns = 120; // ~12s
    var pump = function () {
      if (!isMemberFormRoute(window.location.pathname)) {
        memberFormTimer = null;
        return;
      }
      safeCall(ensureExtraFields);
      safeCall(ensureIndiaCountryCodeInPhoneField);
      safeCall(renameStartDateLabel);
      safeCall(hideMembershipStartDateForNewMember);
      safeCall(ensureMembershipStartDateDefaultForNewMember);
      runs += 1;
      if (runs >= maxRuns) {
        memberFormTimer = null;
        return;
      }
      memberFormTimer = setTimeout(pump, 100);
    };
    memberFormTimer = setTimeout(pump, 0);
  }

  function ensureMembersDashboardVisibility() {
    if (!isMembersDashboardRoute(window.location.pathname)) return;
    var main = qs("main");
    var root = qs("#root");
    if (main && main.style) {
      if (main.style.display === "none") main.style.display = "";
      if (main.style.visibility === "hidden") main.style.visibility = "";
      if (main.style.opacity === "0") main.style.opacity = "";
    }
    if (root && root.style) {
      if (root.style.display === "none") root.style.display = "";
      if (root.style.visibility === "hidden") root.style.visibility = "";
      if (root.style.opacity === "0") root.style.opacity = "";
    }
    var routeLayer = qs("#gm-route-transition");
    if (routeLayer) {
      routeLayer.style.display = "none";
      routeLayer.style.visibility = "hidden";
      routeLayer.style.opacity = "0";
      routeLayer.style.pointerEvents = "none";
    }
    var logoutLayer = qs("#gm-logout-outro");
    if (logoutLayer) {
      logoutLayer.classList.remove("gm-active");
      logoutLayer.style.opacity = "0";
      logoutLayer.style.pointerEvents = "none";
    }
    removeMembershipTypeView();
    var host = qs("main") || qs("#root");
    if (!host || !host.children || !host.children.length) return;
    Array.prototype.slice.call(host.children).forEach(function (el) {
      if (!el) return;
      if (el.id === "gm-membership-type-view") {
        el.remove();
        return;
      }
      if (el.getAttribute("data-gm-mtype-hidden") === "1") {
        var prev = el.getAttribute("data-gm-mtype-prev-display");
        el.style.display = prev || "";
        el.removeAttribute("data-gm-mtype-hidden");
        el.removeAttribute("data-gm-mtype-prev-display");
      }
      if (el.style && el.style.display === "none" && !el.hasAttribute("hidden")) {
        el.style.display = "";
      }
    });
  }

  function setupMembersDashboardVisibilityObserver() {
    if (!isMembersDashboardRoute(window.location.pathname)) {
      if (membersDashboardVisibilityObserver) {
        membersDashboardVisibilityObserver.disconnect();
        membersDashboardVisibilityObserver = null;
      }
      return;
    }
    if (membersDashboardVisibilityObserver) return;
    membersDashboardVisibilityObserver = new MutationObserver(function () {
      ensureMembersDashboardVisibility();
    });
    membersDashboardVisibilityObserver.observe(document.body, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: ["style", "class", "hidden"],
    });
  }

  function bindMembersDashboardVisibilityGuard() {
    if (membersDashboardVisibilityGuardBound) return;
    membersDashboardVisibilityGuardBound = true;
    document.addEventListener(
      "input",
      function (ev) {
        if (!isMembersDashboardRoute(window.location.pathname)) return;
        var target = ev.target;
        if (!target || !target.tagName) return;
        var tag = String(target.tagName || "").toUpperCase();
        if (tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT") return;
        setTimeout(ensureMembersDashboardVisibility, 0);
      },
      true
    );
  }

  function enforcePhoneSingleColumnLayout() {
    var isPhone = window.matchMedia && window.matchMedia("(max-width: 768px)").matches;
    var root = qs("#root");
    if (!root) return;

    if (!isPhone) {
      document.documentElement.removeAttribute("data-gm-phone-layout");
      qsa("[data-gm-mobile-inline='1']").forEach(function (el) {
        el.removeAttribute("style");
        el.removeAttribute("data-gm-mobile-inline");
      });
      return;
    }

    document.documentElement.setAttribute("data-gm-phone-layout", "1");

    function nearestBlock(el) {
      return el && el.closest ? el.closest("aside,nav,main,section,article,div") : null;
    }

    function findLca(a, b) {
      if (!a || !b) return null;
      var seen = [];
      var cur = a;
      while (cur) {
        seen.push(cur);
        cur = cur.parentElement;
      }
      var node = b;
      while (node) {
        if (seen.indexOf(node) >= 0) return node;
        node = node.parentElement;
      }
      return null;
    }

    // Find the left navigation rail (Dashboard/Members/Calendar links).
    var navLink = qsa("a,button,span,div").find(function (el) {
      var t = String(el.textContent || "").trim();
      return t === "Dashboard" || t === "Members";
    });
    if (!navLink) return;

    var navShell = nearestBlock(navLink);
    if (!navShell) return;

    // Find main content area by visible dashboard/member headings and compute
    // a common container to reliably flatten desktop split layout on phone.
    var contentHint = qsa("h1,h2,h3,div,p,span").find(function (el) {
      var t = String(el.textContent || "").trim().toLowerCase();
      return t.indexOf("welcome back") >= 0 || t === "total members" || t === "add member";
    });
    var contentShell = nearestBlock(contentHint);
    var layout = findLca(navShell, contentShell) || navShell.parentElement;
    if (!layout) return;

    // If LCA is too high, walk down to a more practical shell.
    var candidate = layout;
    while (candidate && candidate.parentElement && candidate.parentElement !== root && candidate.children.length === 1) {
      candidate = candidate.children[0];
    }
    if (candidate && candidate !== root) layout = candidate;

    layout.style.display = "block";
    layout.style.width = "100%";
    layout.style.maxWidth = "100%";
    layout.style.minWidth = "0";
    layout.style.overflowX = "hidden";
    layout.setAttribute("data-gm-mobile-inline", "1");

    navShell.style.width = "100%";
    navShell.style.maxWidth = "100%";
    navShell.style.minWidth = "0";
    navShell.style.position = "relative";
    navShell.style.display = "block";
    navShell.style.left = "0";
    navShell.style.top = "0";
    navShell.style.right = "0";
    navShell.style.transform = "none";
    navShell.style.float = "none";
    navShell.style.margin = "0 0 10px 0";
    navShell.setAttribute("data-gm-mobile-inline", "1");

    // Ensure sibling content uses full width below nav.
    var siblings = Array.prototype.slice.call(layout.children || []);
    siblings.forEach(function (child) {
      if (!child || child === navShell) return;
      child.style.width = "100%";
      child.style.maxWidth = "100%";
      child.style.minWidth = "0";
      child.style.display = "block";
      child.style.marginLeft = "0";
      child.style.marginRight = "0";
      child.style.float = "none";
      child.style.transform = "none";
      child.style.gridColumn = "1 / -1";
      child.style.flex = "1 1 auto";
      child.setAttribute("data-gm-mobile-inline", "1");
    });
  }

  function onRouteChange() {
    if (restoreMembershipTypeRouteAfterBoot()) return;
    if (!isMembershipTypeRoute(window.location.pathname)) {
      removeMembershipTypeView();
    }
    safeCall(syncAppThemeFromStorage);
    safeCall(bindDashboardTitleCaseFormatter);
    safeCall(ensureAppTransitionStyles);
    safeCall(ensureRouteTransitionLayer);
    if (!routeTransitionBootstrapped) {
      routeTransitionBootstrapped = true;
      safeCall(playPostLoginEntryTransition);
    }
    safeCall(ensureMembershipTypeNavLinkFromStart);
    safeCall(ensureMemberFormEnhancementsFromStart);
    safeCall(enforceMemberFormLayoutStability);
    safeCall(updateMembershipTypeNavActiveState);
    safeCall(ensureMembershipTypeView);
    safeCall(ensureExtraFields);
    safeCall(ensureIndiaCountryCodeInPhoneField);
    safeCall(renameStartDateLabel);
    safeCall(hideMembershipStartDateForNewMember);
    safeCall(ensureMembershipStartDateDefaultForNewMember);
    safeCall(setupDashboardObserver);
    safeCall(scheduleDashboardDecorate);
    safeCall(ensureCsvFormatInDashboard);
    safeCall(bindImportButtonToCsvModal);
    safeCall(patchCsvImportDialogText);
    safeCall(bindCsvTemplateDownloadOverride);
    safeCall(ensureLogoutButton);
    safeCall(ensureLoginBackgroundTool);
    safeCall(ensureChatbot);
    safeCall(bindMembersDashboardVisibilityGuard);
    safeCall(ensureMembersDashboardVisibility);
    safeCall(setupMembersDashboardVisibilityObserver);
    safeCall(ensureTopHeaderFontSize);
    safeCall(enforcePhoneSingleColumnLayout);
    setTimeout(function () {
      safeCall(ensureMembersDashboardVisibility);
      safeCall(setupMembersDashboardVisibilityObserver);
      safeCall(ensureTopHeaderFontSize);
      safeCall(enforcePhoneSingleColumnLayout);
      safeCall(enforceMemberFormLayoutStability);
    }, 120);
  }

  function scheduleRouteChangeIfPathChanged(prevPathname) {
    var before = normalizePath(prevPathname || "");
    var after = normalizePath(window.location.pathname || "");
    if (before !== after) {
      setTimeout(onRouteChange, 50);
    }
  }

  var origPushState = history.pushState;
  history.pushState = function () {
    var prevPathname = window.location.pathname;
    origPushState.apply(history, arguments);
    scheduleRouteChangeIfPathChanged(prevPathname);
  };
  var origReplaceState = history.replaceState;
  history.replaceState = function () {
    var prevPathname = window.location.pathname;
    origReplaceState.apply(history, arguments);
    scheduleRouteChangeIfPathChanged(prevPathname);
  };
  window.addEventListener("popstate", function () {
    setTimeout(onRouteChange, 50);
  });
  window.addEventListener("resize", function () {
    setTimeout(function () {
      safeCall(enforcePhoneSingleColumnLayout);
    }, 80);
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      syncAppThemeFromStorage();
      ensurePatchStyles();
      ensureAppTransitionStyles();
      ensureRouteTransitionLayer();
      onRouteChange();
    });
  } else {
    syncAppThemeFromStorage();
    ensurePatchStyles();
    ensureAppTransitionStyles();
    ensureRouteTransitionLayer();
    onRouteChange();
  }
})();
