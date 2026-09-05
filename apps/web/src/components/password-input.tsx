"use client";

import { useState, type InputHTMLAttributes } from "react";
import { inputClass } from "@/components/ui";

export function PasswordInput({
  className = "",
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [visible, setVisible] = useState(false);

  return (
    <span className="relative block">
      <input
        {...props}
        type={visible ? "text" : "password"}
        className={`${inputClass} pl-20 ${className}`}
      />
      <button
        type="button"
        onClick={() => setVisible((value) => !value)}
        aria-pressed={visible}
        className="absolute inset-y-0 left-2 my-auto h-fit rounded-control px-2 py-1 text-xs font-bold text-accent hover:bg-accent-subtle"
      >
        {visible ? "پنهان" : "نمایش"}
      </button>
    </span>
  );
}
