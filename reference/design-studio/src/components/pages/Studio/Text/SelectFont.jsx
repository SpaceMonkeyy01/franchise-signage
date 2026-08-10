
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

export default function SelectFont({
  value,
  onChange,
  options = [],
  className = "",
  placeholder = "Select Font",
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        className={`w-full border border-white/10 rounded-lg focus:ring-2 focus:ring-mainthemeYello ${className}`}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>

      <SelectContent className="bg-background">
        {options.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}