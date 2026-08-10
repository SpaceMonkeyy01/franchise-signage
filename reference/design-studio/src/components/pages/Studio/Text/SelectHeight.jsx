import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

export default function SelectHeight({
  value,
  onChange,
  className = "",
  placeholder = "Select Height",
}) {
  const options = Array.from({ length: 34 }, (_, i) => 12 + i);

  return (
    <Select value={String(value)} onValueChange={(val) => onChange(Number(val))}>
      <SelectTrigger
        className={`w-full border border-white/10 rounded-lg text-md focus:ring-2 focus:ring-mainthemeYello ${className}`}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>

      <SelectContent className="bg-background text-2xl">
        {options.map((h) => (
          <SelectItem key={h} value={String(h)}>
            {h}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}