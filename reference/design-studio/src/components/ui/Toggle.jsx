const Toggle = ({ enabled, onChange, label }) => {
  return (
    <div className="flex items-center gap-2">
      {label && (
        <label className="text-sm font-medium text-foreground cursor-pointer">
          {label}
        </label>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={() => onChange(!enabled)}
        className={`
          relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent 
          transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-#ffc413 focus:ring-offset-2 focus:ring-offset-background
          ${enabled ? 'bg-[#ffc413]' : 'bg-gray-600'}
        `}
      >
        <span
          className={`
            pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 
            transition duration-200 ease-in-out
            ${enabled ? 'translate-x-5' : 'translate-x-0'}
          `}
        />
      </button>
    </div>
  );
};

export default Toggle;
