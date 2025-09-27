import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TestComponent from "./TestComponent";

describe("TestComponent", () => {
  const mockOnClick = jest.fn();

  it("renders with correct name and button", () => {
    render(<TestComponent name="Alice" onClick={mockOnClick} />);
    expect(
      screen.getByRole("heading", { name: /hello alice/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /click me/i }),
    ).toBeInTheDocument();
  });

  it("calls onClick when button is clicked", async () => {
    render(<TestComponent name="Bob" onClick={mockOnClick} />);
    const btn = screen.getByRole("button", { name: /click me/i });
    await userEvent.click(btn);
    expect(mockOnClick).toHaveBeenCalledTimes(1);
  });

  it("updates on re-render with different props", () => {
    const { rerender } = render(
      <TestComponent name="Charlie" onClick={mockOnClick} />,
    );
    let btn = screen.getByRole("button", { name: /click me/i });
    expect(btn).toHaveAttribute("name", "Charlie");

    rerender(<TestComponent name="Delta" onClick={mockOnClick} />);
    btn = screen.getByRole("button", { name: /click me/i });
    expect(btn).toHaveAttribute("name", "Delta");
  });

  it("is accessible with correct aria-labels", () => {
    render(<TestComponent name="Echo" onClick={mockOnClick} />);
    expect(
      screen.getByRole("heading", { name: /hello echo/i }),
    ).toHaveTextContent("Hello Echo");
    expect(screen.getByRole("button", { name: /click me/i })).toHaveTextContent(
      "Click me",
    );
  });
});
