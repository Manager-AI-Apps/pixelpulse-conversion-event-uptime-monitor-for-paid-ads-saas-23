import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import Page from "@/app/page";

describe("landing page", () => {
  it("renders product name and value prop", () => {
    render(<Page />);
    expect(screen.getAllByText(/PixelPulse/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/broken pixel/i).length).toBeGreaterThan(0);
  });
});
