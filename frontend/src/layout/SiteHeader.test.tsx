// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { THEME_KEY } from "../theme";
import { SiteHeader } from "./SiteHeader";

const renderHeader = () =>
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <SiteHeader />
    </MemoryRouter>,
  );

describe("day and night mode", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    cleanup();
    delete document.documentElement.dataset.theme;
  });

  it("starts in day mode when nothing is saved and the OS gives no preference", () => {
    renderHeader();
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(screen.getByRole("button", { name: "Switch to night mode" })).toBeTruthy();
  });

  it("switches between night and day and remembers the choice", async () => {
    renderHeader();
    await userEvent.click(screen.getByRole("button", { name: "Switch to night mode" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem(THEME_KEY)).toBe("dark");

    await userEvent.click(screen.getByRole("button", { name: "Switch to day mode" }));
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem(THEME_KEY)).toBe("light");
  });

  it("opens in the mode chosen last time", () => {
    localStorage.setItem(THEME_KEY, "dark");
    renderHeader();
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(screen.getByRole("button", { name: "Switch to day mode" })).toBeTruthy();
  });
});
