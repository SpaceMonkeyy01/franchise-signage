import { useSelector } from "react-redux";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

const MountingTypeSelect = ({ options, setOptionsData }) => {
  const { single_filtered_option } = useSelector((state) => state.SignForm);

  const selectedOptions = single_filtered_option?.["mounting_type"]?.map(
    (item) => ({
      name: item.name,
      value: item.name,
    })
  );

  return (
    <Select
      value={options.mounting_type}
      onValueChange={(value) =>
        setOptionsData({ target: { name: "mounting_type", value } })
      }
    >
      <SelectTrigger className="w-full border border-gray-500 rounded-lg text-foreground focus:ring-2 focus:ring-mainthemeYello">
        <SelectValue placeholder="Select Mounting Type" />
      </SelectTrigger>
      <SelectContent className="bg-background">
        {selectedOptions?.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default MountingTypeSelect;
