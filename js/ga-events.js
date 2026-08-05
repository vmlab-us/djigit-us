(function () {
  "use strict";

  const EVENT_NAMES = {
    requestCar: "click_request_car",
    startApplication: "click_start_application",
    whatsapp: "click_whatsapp",
    phone: "click_phone",
    email: "click_email",
    contact: "click_contact",
    instagram: "click_instagram",
  };

  function normalizedText(element) {
    return (element.textContent || element.getAttribute("aria-label") || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function pathMatches(url, expectedPath) {
    try {
      return new URL(url, window.location.href).pathname.replace(/\/+$/, "/") === expectedPath;
    } catch (_error) {
      return false;
    }
  }

  function eventNameForLink(link) {
    const href = (link.getAttribute("href") || "").trim();
    const hrefLower = href.toLowerCase();
    const textLower = normalizedText(link).toLowerCase();

    if (hrefLower.includes("wa.me") || hrefLower.includes("whatsapp")) {
      return EVENT_NAMES.whatsapp;
    }
    if (hrefLower.startsWith("tel:")) {
      return EVENT_NAMES.phone;
    }
    if (
      hrefLower.startsWith("mailto:") ||
      (hrefLower.includes("mail.google.com/mail/") && hrefLower.includes("to="))
    ) {
      return EVENT_NAMES.email;
    }
    if (hrefLower.includes("instagram.com")) {
      return EVENT_NAMES.instagram;
    }
    if (pathMatches(href, "/application/") && /start application|credit application/i.test(textLower)) {
      return EVENT_NAMES.startApplication;
    }
    if (pathMatches(href, "/contact/") && /request a car/i.test(textLower)) {
      return EVENT_NAMES.requestCar;
    }
    if (pathMatches(href, "/contact/") && /\bcontact\b/i.test(textLower)) {
      return EVENT_NAMES.contact;
    }

    return "";
  }

  function tagTrackedLinks() {
    document.querySelectorAll("a[href]").forEach((link) => {
      if (!link.dataset.gaEvent) {
        const eventName = eventNameForLink(link);
        if (eventName) link.dataset.gaEvent = eventName;
      }
    });
  }

  document.addEventListener("DOMContentLoaded", tagTrackedLinks);

  document.addEventListener("click", (event) => {
    const link = event.target instanceof Element
      ? event.target.closest("a[data-ga-event]")
      : null;
    if (!link || typeof window.gtag !== "function") return;

    window.gtag("event", link.dataset.gaEvent, {
      event_category: "lead_action",
      link_text: normalizedText(link),
      link_url: link.getAttribute("href") || "",
      page_location: window.location.href,
      page_title: document.title,
    });
  });
})();
