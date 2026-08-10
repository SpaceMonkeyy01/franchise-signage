export const SignizeLoader = ({ size = "md", text = "Loading...", className = "" }) => {
  const sizeClasses = {
    sm: "w-8 h-8",
    md: "w-12 h-12",
    lg: "w-16 h-16",
  }

  return (
    <div className={`flex flex-col items-center justify-center space-y-3 ${className}`}>
      <div className={`relative ${sizeClasses[size]}`}>
        {/* Outer rotating ring */}
        <div className="absolute inset-0 border-4 border-primary/20 rounded-full animate-spin border-t-primary"></div>
        {/* Inner rotating ring */}
        <div className="absolute inset-2 border-2 border-accent/30 rounded-full animate-spin animate-reverse border-b-accent"></div>
        {/* Center pulsing dot */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
        </div>
      </div>
      {text && <p className="text-sm text-muted-foreground font-medium">{text}</p>}
    </div>
  )
}

export const MockupLoader = ({ className = "" }) => {
  return (
    <div className={`flex flex-col items-center justify-center space-y-4 ${className}`}>
      <div className="relative w-16 h-12">
        {/* Sign frame */}
        <div className="absolute inset-0 border-2 border-primary rounded-sm animate-pulse">
          <div className="absolute inset-1 bg-primary/10 rounded-sm"></div>
        </div>
        {/* Mounting brackets */}
        <div className="absolute -left-1 top-1/2 transform -translate-y-1/2 w-2 h-3 bg-muted-foreground rounded-sm animate-pulse"></div>
        <div className="absolute -right-1 top-1/2 transform -translate-y-1/2 w-2 h-3 bg-muted-foreground rounded-sm animate-pulse"></div>
      </div>

      {/* Bouncing dots */}
      <div className="flex space-x-1">
        <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></div>
        <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></div>
        <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></div>
      </div>

      <p className="text-sm text-muted-foreground font-medium">Generating Mockup...</p>
    </div>
  )
}

export const PriceLoader = ({ className = "" }) => {
  return (
    <div className={`flex flex-col items-center justify-center space-y-3 ${className}`}>
      <div className="relative w-12 h-12">
        {/* Calculator body */}
        <div className="absolute inset-0 bg-card border-2 border-primary rounded-lg animate-pulse">
          {/* Calculator screen */}
          <div className="absolute top-1 left-1 right-1 h-3 bg-primary/20 rounded-sm"></div>
          {/* Calculator buttons grid */}
          <div className="absolute bottom-1 left-1 right-1 grid grid-cols-3 gap-0.5">
            <div className="w-2 h-1.5 bg-muted rounded-sm"></div>
            <div className="w-2 h-1.5 bg-muted rounded-sm"></div>
            <div className="w-2 h-1.5 bg-muted rounded-sm"></div>
          </div>
        </div>

        {/* Floating dollar sign */}
        <div className="absolute -top-2 -right-2 w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs font-bold animate-bounce">
          $
        </div>
      </div>

      <p className="text-sm text-muted-foreground font-medium">Calculating Price...</p>
    </div>
  )
}
