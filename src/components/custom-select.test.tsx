import { fireEvent, render, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CustomSelect } from "@/components/custom-select";

const options = [
  { value: "ordered", label: "未发货", tone: "amber" as const },
  { value: "shipped", label: "已发货", tone: "green" as const },
  { value: "received", label: "已收到", tone: "teal" as const }
];

function hiddenValue(container: HTMLElement) {
  return container.querySelector<HTMLInputElement>('input[name="status"]');
}

describe("CustomSelect", () => {
  it("updates the hidden form value after choosing a designed option", () => {
    const { container } = render(
      <CustomSelect ariaLabel="订单状态" defaultValue="ordered" name="status" options={options} />
    );

    const view = within(container);
    expect(hiddenValue(container)).toHaveValue("ordered");
    fireEvent.click(view.getByRole("combobox", { name: "订单状态" }));
    expect(view.getByRole("listbox")).toBeInTheDocument();

    fireEvent.click(view.getByRole("option", { name: "已发货" }));

    expect(hiddenValue(container)).toHaveValue("shipped");
    expect(view.getByRole("combobox", { name: "订单状态" })).toHaveTextContent("已发货");
    expect(view.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("supports keyboard selection and closes with Escape or an outside click", () => {
    const { container } = render(
      <div>
        <CustomSelect ariaLabel="履约状态" defaultValue="shipped" name="status" options={options} />
        <button type="button">外部按钮</button>
      </div>
    );
    const view = within(container);
    const combobox = view.getByRole("combobox", { name: "履约状态" });

    expect(combobox).toHaveAttribute("aria-expanded", "false");
    fireEvent.keyDown(combobox, { key: "Enter" });
    expect(combobox).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(combobox, { key: "End" });
    fireEvent.keyDown(combobox, { key: "Enter" });
    expect(hiddenValue(container)).toHaveValue("received");

    fireEvent.keyDown(combobox, { key: "Enter" });
    fireEvent.keyDown(combobox, { key: "Home" });
    fireEvent.keyDown(combobox, { key: "Enter" });
    expect(hiddenValue(container)).toHaveValue("ordered");

    fireEvent.keyDown(combobox, { key: "Enter" });
    fireEvent.keyDown(combobox, { key: "Escape" });
    expect(view.queryByRole("listbox")).not.toBeInTheDocument();

    fireEvent.click(combobox);
    fireEvent.pointerDown(view.getByRole("button", { name: "外部按钮" }));
    expect(view.queryByRole("listbox")).not.toBeInTheDocument();

    fireEvent.keyDown(combobox, { key: "ArrowDown" });
    fireEvent.keyDown(combobox, { key: "ArrowDown" });
    fireEvent.keyDown(combobox, { key: "Enter" });
    expect(hiddenValue(container)).toHaveValue("shipped");

    fireEvent.keyDown(combobox, { key: "ArrowUp" });
    fireEvent.keyDown(combobox, { key: "Tab" });
    expect(view.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("keeps its value and cannot open while disabled", () => {
    const { container } = render(
      <CustomSelect ariaLabel="履约状态" defaultValue="shipped" disabled name="status" options={options} />
    );
    const view = within(container);
    const combobox = view.getByRole("combobox", { name: "履约状态" });

    expect(combobox).toBeDisabled();
    expect(hiddenValue(container)).toHaveValue("shipped");
    fireEvent.click(combobox);
    expect(view.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("syncs a new server-provided default value", () => {
    const { container, rerender } = render(
      <CustomSelect ariaLabel="订单状态" defaultValue="ordered" name="status" options={options} />
    );

    rerender(<CustomSelect ariaLabel="订单状态" defaultValue="received" name="status" options={options} />);

    expect(hiddenValue(container)).toHaveValue("received");
    expect(within(container).getByRole("combobox", { name: "订单状态" })).toHaveTextContent("已收到");
  });
});
