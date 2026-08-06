import { render, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CollectionSummary } from "@/components/collection-summary";

const stats = [
  {
    currency: "CNY",
    total: "300.00",
    recordsTotal: "200.00",
    shippingTotal: "20.00",
    additionalFeeTotal: "7.50",
    taxTotal: "15.50",
    orderCount: 1,
    recordCount: 1
  },
  {
    currency: "EUR",
    total: "50.50",
    recordsTotal: "40.50",
    shippingTotal: "5.00",
    additionalFeeTotal: "0.00",
    taxTotal: "2.00",
    orderCount: 1,
    recordCount: 2
  }
];

describe("CollectionSummary", () => {
  it("groups each currency under five independent accounting categories", () => {
    const { container } = render(<CollectionSummary stats={stats} />);
    const view = within(container);
    const totalCard = view.getByRole("article", { name: "总金额" });
    const recordsCard = view.getByRole("article", { name: "唱片金额" });
    const shippingCard = view.getByRole("article", { name: "运费" });
    const additionalFeeCard = view.getByRole("article", { name: "附加费" });
    const taxCard = view.getByRole("article", { name: "已含税费" });

    expect(totalCard).toHaveTextContent("¥300.00");
    expect(totalCard).toHaveTextContent("€50.50");
    expect(totalCard).toHaveTextContent("2 张订单 · 3 张唱片");
    expect(recordsCard).toHaveTextContent("¥200.00");
    expect(recordsCard).toHaveTextContent("€40.50");
    expect(shippingCard).toHaveTextContent("¥20.00");
    expect(shippingCard).toHaveTextContent("€5.00");
    expect(additionalFeeCard).toHaveTextContent("¥7.50");
    expect(additionalFeeCard).toHaveTextContent("€0.00");
    expect(taxCard).toHaveTextContent("¥15.50");
    expect(taxCard).toHaveTextContent("€2.00");
    expect(view.getByText("税费已包含在总金额中；五张卡片是分类视图，不能直接相加。")).toBeInTheDocument();
  });

  it("shows one unified empty state when no orders are available", () => {
    const { container } = render(<CollectionSummary stats={[]} />);
    const view = within(container);

    expect(view.getByText("导入第一张订单后，这里会显示消费统计。")).toBeInTheDocument();
    expect(view.queryByRole("article")).not.toBeInTheDocument();
  });
});
