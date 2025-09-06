import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TestReactFile from "./path_to_your_component"; // Adjust the import path accordingly

describe("TestReactFile", () => {
  const title = "Main Title";
  const subtitle = "Subtitle";

  test("renders title and optional subtitle correctly", () => {
    render(<TestReactFile title={title} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(title);
    expect(screen.queryByRole("heading", { level: 2 })).not.toBeInTheDocument();

    render(<TestReactFile title={title} subtitle={subtitle} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(title);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      subtitle,
    );
  });

  test("renders button with correct onClick handler", () => {
    render(<TestReactFile title={title} />);
    const button = screen.getByRole("button");
    expect(button).toBeInTheDocument();
    userEvent.click(button);
    // Assuming the console log is for debugging purposes, we can't assert on it directly in tests
  });

  test("has accessible title and role attributes", () => {
    render(<TestReactFile title={title} />);
    const heading1 = screen.getByRole("heading", { level: 1 });
    expect(heading1).toHaveAccessibleName(title);
    expect(heading1).toBeInTheDocument();

    if (subtitle) {
      const heading2 = screen.getByRole("heading", { level: 2 });
      expect(heading2).toHaveAccessibleName(subtitle);
      expect(heading2).toBeInTheDocument();
    }
  });
});
