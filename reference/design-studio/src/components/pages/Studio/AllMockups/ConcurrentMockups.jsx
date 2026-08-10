import { useEffect, useState } from "react";
import SingleMockupCall from "./SingleMockupCall";
import { useSelector } from "react-redux";
import { getMockupTypes } from "../../../../utils/getMockupTypes";

const ConcurrentMockups = () => {
  const { default_options, allMockupsAndQuotes, allMockupCreationLoading } =
    useSelector((state) => state.SignForm);

  let mockupTypes = getMockupTypes(default_options);
  if (Array.isArray(mockupTypes)) {
    mockupTypes = mockupTypes.slice(0, 6);
  }

  const [activeIndex, setActiveIndex] = useState(0);

  const handleDone = () => {
    setActiveIndex((prev) => prev + 1); // trigger next component
  };

  const steps = [
    "🖌️ Preparing your mockup canvas...",
    "⚙️ Mockups are now generating...",
    "✨ Applying details and enhancements...",
    "✅ Almost done! Your mockups will be ready shortly...",
  ];

  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    let timer;

    if (allMockupCreationLoading) {
      setCurrentStep(0); // reset when loading starts

      timer = setInterval(() => {
        setCurrentStep((prev) => (prev < steps.length - 1 ? prev + 1 : prev));
      }, 6000); // show next step every 6s
    }

    return () => {
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allMockupCreationLoading]);

  return (
    <div className="md:max-w-11/12 w-full mx-auto">
      <h1 className="lg:text-3xl md:text-xl text-lg font-bold">All Mockups</h1>
      {allMockupCreationLoading && (
        <div className="text-center w-max md:text-xl text-md font-medium mt-6">
          <p className="animate-pulse">{steps[currentStep]}</p>
        </div>
      )}

      <div className=" gap-5 mt-5 grid lg:grid-cols-3 md:grid-cols-2 grid-cols-1">
        {mockupTypes.map((mockup, index) => {
          let findMockup = allMockupsAndQuotes?.find(
            (item) => item.name == mockup.name
          );

          // console.log("findMockup", findMockup);

          return (
            <SingleMockupCall
              key={index}
              mockup={mockup}
              shouldRun={index === activeIndex} // 👈 only run if active
              onDone={handleDone}
              activeIndex={activeIndex}
              index={index}
              mockupCost={findMockup ? findMockup?.cost : null}
              generatedMockupImage={findMockup ? findMockup?.mockupImage : null}
            />
          );
        })}
      </div>
    </div>
  );
};

export default ConcurrentMockups;
