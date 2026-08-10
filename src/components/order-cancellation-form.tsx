type OrderCancellationFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  cancelled: boolean;
  className?: string;
};

export function OrderCancellationForm({ action, cancelled, className = "" }: OrderCancellationFormProps) {
  return (
    <form action={action} className={`rounded-3xl border border-red-200 bg-red-50 p-5 ${className}`}>
      <h2 className="font-semibold text-red-900">{cancelled ? "恢复整张订单" : "取消整张订单"}</h2>
      <p className="mt-2 text-sm leading-6 text-red-800">
        {cancelled
          ? "恢复后，有效唱片会重新出现在首页并计入统计，履约状态保持不变。"
          : "订单内所有唱片会从首页隐藏，并从消费统计中排除。"}
      </p>
      <button className={`mt-4 h-10 w-full rounded-lg text-sm font-semibold text-white ${cancelled ? "bg-emerald-700" : "bg-red-700"}`}>
        {cancelled ? "确认恢复订单" : "确认取消订单"}
      </button>
    </form>
  );
}
