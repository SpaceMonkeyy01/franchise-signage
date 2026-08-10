import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useSelector } from "react-redux";
import { base64ToBlobUrl } from "../../../../utils/base64ToBlobUrl";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"

const DetectedLines = () => {
  const { detectedLines } = useSelector((state) => state.SignForm);
  console.log("detectedLines", detectedLines);

  if (!detectedLines || detectedLines.length === 0) {
    return;
  }

  return (
    <div className="border-2 text-white px-3">
      <Accordion
        type="single"
        className="max-w-lg"
        defaultValue={""}
        collapsible
      >
        <AccordionItem key="detectedLines" value="detectedLines" >
          <AccordionTrigger className="text-lg">Total Lines ({detectedLines?.length})</AccordionTrigger>
          <AccordionContent>
            <Table className={""}>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-white">Line #</TableHead>
                  <TableHead className="text-white">Image</TableHead>
                  <TableHead className="text-white">Width</TableHead>
                  <TableHead className="text-white">Height</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detectedLines.map((item, index) => {
                  const base64Data = item?.imageBase64?.startsWith("data:image")
                    ? item?.imageBase64
                    : `data:image/png;base64,${item?.imageBase64}`;

                  const handleImageClick = () => {
                    const url = base64ToBlobUrl(base64Data);
                    window.open(url, "_blank");
                  };

                  return (
                    <TableRow key={item.sectionIndex}>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell>
                        <img
                          src={base64Data}
                          className="h-12 cursor-pointer hover:opacity-80 transition"
                          onClick={handleImageClick}
                          alt={`Detected line ${index + 1}`}
                        />
                      </TableCell>
                      <TableCell>{item.scaledWidth + '"'}</TableCell>
                      <TableCell>{item.scaledHeight + '"'}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </AccordionContent>
        </AccordionItem>

      </Accordion>
      {/* <label className="block text-md font-bold text-black mb-1">
        Total Lines ({detectedLines?.length})
      </label> */}

    </div>
  );
};

export default DetectedLines;
