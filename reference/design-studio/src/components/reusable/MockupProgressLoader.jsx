import { Progress } from "@/components/ui/progress";
import { useEffect, useRef, useState } from "react";

const DURATION_SECONDS = 20; // 👈 Change Seconds Here
const MAX_PROGRESS = 99; // 👈 Stopping Time Progress — 99, 98, 95

const MockupProgressLoader = ({
  mockupLoading,
  created_background_mockup_URL,
}) => {
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(0);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!mockupLoading) return;

    progressRef.current = 0;
    setProgress(0);
    clearInterval(intervalRef.current);

    const incrementPerTick = 100 / ((DURATION_SECONDS * 1000) / 100);

    intervalRef.current = setInterval(() => {
      progressRef.current = Math.min(
        progressRef.current + incrementPerTick,
        MAX_PROGRESS,
      );
      setProgress(progressRef.current);
      if (progressRef.current >= MAX_PROGRESS)
        clearInterval(intervalRef.current);
    }, 100);

    return () => clearInterval(intervalRef.current);
  }, [mockupLoading]);

  useEffect(() => {
    if (!created_background_mockup_URL) return;

    clearInterval(intervalRef.current);

    intervalRef.current = setInterval(() => {
      if (progressRef.current >= 100) {
        progressRef.current = 100;
        setProgress(100);
        clearInterval(intervalRef.current);
        return;
      }
      const remaining = 100 - progressRef.current;
      const speed = Math.max(remaining * 0.1, 0.5); // 👈 0.1 kam tez, 0.2 zyada tez
      progressRef.current = Math.min(progressRef.current + speed, 100);
      setProgress(progressRef.current);
    }, 50); // 👈 50ms interval

    return () => clearInterval(intervalRef.current);
  }, [created_background_mockup_URL]);

  const getMessage = (progress) => {
    if (progress < 20) return "Initializing mockup generation...";
    if (progress < 40) return "Analyzing your design...";
    if (progress < 60) return "Applying design to mockup...";
    if (progress < 80) return "Finalizing details...";
    if (progress < 100) return "Almost there...";
    return "Mockup generated successfully!";
  };

  return (
    <div className="absolute h-full w-full bottom-[30px] left-0 bg-[rgba(0,0,0,0.5)] flex flex-col items-center justify-end text-white z-50 pb-4 sm:pb-6 md:pb-8">
      <div className="w-full max-w-2xl px-3 sm:px-4 md:px-6 space-y-2 sm:space-y-3">
        {progress && (
          <p className="text-sm sm:text-base md:text-lg font-medium text-white animate-textPulse tracking-wide">
            {getMessage(progress)}
          </p>
        )}

        <Progress
          value={progress}
          className="h-3 sm:h-4 md:h-5 w-full"
          indicatorClassName="transition-all duration-100 ease-linear"
          indicatorStyle={{ backgroundColor: "#f7ce46" }} // 👈 Color Change Here
        />
        <div className="relative h-5 sm:h-6">
          <p
            className="text-sm sm:text-base md:text-xl font-bold text-white absolute transition-all duration-100 ease-linear"
            style={{
              left: `${Math.min(Math.max(progress, 2), 98)}%`,
              transform: "translateX(-50%)",
            }}
          >
            {Math.round(progress)}%
          </p>
        </div>
      </div>
    </div>
  );
};

export default MockupProgressLoader;
