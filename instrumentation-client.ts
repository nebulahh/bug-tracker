/**
 * Development-only cleanup for browser-extension hydration noise.
 *
 * Microsoft Edge's autofill adds a `fdprocessedid` attribute to every button
 * and input it sees while the page loads. React hydrates the server HTML after
 * that and reports "some attributes of the server rendered HTML didn't match
 * the client properties" for an attribute the app never renders, flooding the
 * dev console on every page. The attribute is inert and is not part of the
 * markup we ship.
 *
 * This file runs before the app becomes interactive, so removing the attribute
 * here (and while the extension is still adding it) keeps that false positive
 * out of the console. Production only logs hydration mismatches in development,
 * so nothing here needs to run in production; `process.env.NODE_ENV` is
 * inlined at build time.
 */
if (process.env.NODE_ENV !== "production" && typeof document !== "undefined") {
  const FORM_FILL_ATTRIBUTE = "fdprocessedid";

  const stripFormFillAttribute = () => {
    for (const element of document.querySelectorAll(`[${FORM_FILL_ATTRIBUTE}]`)) {
      element.removeAttribute(FORM_FILL_ATTRIBUTE);
    }
  };

  try {
    stripFormFillAttribute();

    const observer = new MutationObserver(stripFormFillAttribute);
    observer.observe(document.documentElement, {
      subtree: true,
      attributes: true,
      attributeFilter: [FORM_FILL_ATTRIBUTE],
    });

    // Hydration has started by the load event; a short grace period catches
    // attributes the extension adds as it finishes scanning the page.
    window.addEventListener(
      "load",
      () => window.setTimeout(() => observer.disconnect(), 2_000),
      { once: true },
    );
  } catch {
    // Instrumentation must never break the app; the worst case is the original
    // dev-only console warning.
  }
}
