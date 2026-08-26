import { describe, expect, it } from "vitest";

import { classifyPage, type PageSignals } from "./live-url.js";

const signals = (over: Partial<PageSignals>): PageSignals => ({
  finalUrl: "https://app.test/sk/app/org/x/documents",
  title: "Doklady · Účtoinak",
  heading: "Doklady",
  bodyText: "Doklady ".repeat(80),
  hasPasswordField: false,
  ...over,
});

const requested = "https://app.test/sk/app/org/x/documents";

describe("classifyPage", () => {
  it("accepts a normal page", () => {
    expect(classifyPage(requested, signals({}))).toEqual({ kind: "ok" });
  });

  it("detects a redirect to a login-ish path", () => {
    expect(classifyPage(requested, signals({ finalUrl: "https://app.test/sk/login?next=%2Fdocs" }))).toEqual({
      kind: "login",
      finalUrl: "https://app.test/sk/login?next=%2Fdocs",
    });
    expect(classifyPage(requested, signals({ finalUrl: "https://auth.test/auth/realms/x" }))).toMatchObject({ kind: "login" });
  });

  it("does not call a login page 'login' when that is what was requested", () => {
    expect(classifyPage("https://app.test/login", signals({ finalUrl: "https://app.test/login", hasPasswordField: true }))).toEqual({ kind: "ok" });
  });

  it("treats a password form on a different path as a login page", () => {
    expect(classifyPage(requested, signals({ finalUrl: "https://app.test/sk/prihlasenie", hasPasswordField: true }))).toMatchObject({ kind: "login" });
  });

  it("detects error pages by title, heading or a near-empty body", () => {
    expect(classifyPage(requested, signals({ title: "404: This page could not be found" }))).toMatchObject({ kind: "error-page" });
    expect(classifyPage(requested, signals({ heading: "Something went wrong" }))).toMatchObject({ kind: "error-page" });
    expect(classifyPage(requested, signals({ bodyText: "Application error: a client-side exception has occurred" }))).toMatchObject({ kind: "error-page" });
    expect(classifyPage(requested, signals({ title: "Stránka sa nenašla" }))).toMatchObject({ kind: "error-page" });
  });

  it("does not flag a long page that merely mentions an error word in its body", () => {
    expect(classifyPage(requested, signals({ bodyText: `${"Doklady ".repeat(80)} error 404 in a table cell` }))).toEqual({ kind: "ok" });
  });
});
