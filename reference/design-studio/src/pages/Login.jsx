import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Eye, EyeOff, Leaf } from "lucide-react";
import { DEFAULT_BRAND, PRODUCT_NAME } from "../brand/brandTheme";
import { useDispatch, useSelector } from "react-redux";
import { UserLoginAction } from "../store/action/UserLoginAction";
import { useNavigate } from "react-router-dom";

// type LoginFormData = z.infer<typeof loginSchema>;

// Split the brand name across the two hero tile rows (FRESH / BITES).
const brandLetters = DEFAULT_BRAND.name.toUpperCase().replace(/[^A-Z0-9]/g, "");
const brandMid = Math.ceil(brandLetters.length / 2);
const brandRows = [
  brandLetters.slice(0, brandMid).split(""),
  brandLetters.slice(brandMid).split(""),
];

const Login = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState("");

  const { loading } = useSelector((state) => state.User);

  const dispatch = useDispatch();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({ email: "", password: "" });

  console.log("formData", formData);
  const [errors, setErrors] = useState(null);

  useEffect(() => {
    if (serverError) {
      const timer = setTimeout(() => {
        setServerError("");
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [serverError]);

  useEffect(() => {
    // Generate dynamic background elements
    generateMatrixRain();
    generateFloatingElements();

    const intervals = [
      setInterval(refreshMatrixRain, 5000),
      setInterval(refreshFloatingElements, 8000),
    ];

    return () => intervals.forEach(clearInterval);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFormData = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    const errorsData = {};
    if (formData?.email?.trim() == "") {
      errorsData.email = "Email is required";
    }
    if (formData?.password?.trim() == "") {
      errorsData.password = "Password is required";
    }

    if (Object.keys(errorsData).length > 0) {
      setErrors({ ...errorsData });
      return;
    }

    setErrors(null);

    setServerError("");

    try {
      dispatch(
        UserLoginAction({
          form: { email: formData.email, password: formData.password },
          navigate,
        })
      );
    } catch (err) {
      setServerError(err?.message || "Login failed. Please try again.");
    }
  };

  const generateMatrixRain = () => {
    const container = document.getElementById("matrixRain");
    if (!container) return;

    container.innerHTML = "";
    const matrixChars =
      "01ã‚¢ã‚¤ã‚¦ã‚¨ã‚ªã‚«ã‚­ã‚¯ã‚±ã‚³ã‚µã‚·ã‚¹ã‚»ã‚½ã‚¿ãƒãƒ„ãƒ†ãƒˆãƒŠãƒ‹ãƒŒãƒãƒŽãƒãƒ’ãƒ•ãƒ˜ãƒ›ãƒžãƒŸãƒ ãƒ¡ãƒ¢ãƒ¤ãƒ¦ãƒ¨ãƒ©ãƒªãƒ«ãƒ¬ãƒ­ãƒ¯ãƒ²ãƒ³";
    const numColumns = 12;

    for (let i = 0; i < numColumns; i++) {
      const column = document.createElement("div");
      column.className = "matrix-column";

      let matrixString = "";
      const stringLength = Math.floor(Math.random() * 20) + 10;
      for (let j = 0; j < stringLength; j++) {
        matrixString +=
          matrixChars[Math.floor(Math.random() * matrixChars.length)] + "\n";
      }

      column.textContent = matrixString;
      column.style.cssText = `
        position: absolute;
        top: -100%;
        left: ${i * 8}%;
        font-family: 'Courier New', monospace;
        font-size: 14px;
        color: rgba(46, 125, 50, 0.25);
        text-shadow: 0 0 5px rgba(46, 125, 50, 0.25);
        animation: matrix-fall linear infinite ${Math.random() * 3 + 4}s;
        animation-delay: ${Math.random() * 2}s;
        white-space: nowrap;
      `;

      container.appendChild(column);
    }
  };

  const generateFloatingElements = () => {
    const container = document.getElementById("floatingContainer");
    if (!container) return;

    container.innerHTML = "";
    const letters =
      "ABCDEFGHJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz123456789";
    const numLetters = 15;

    for (let i = 0; i < numLetters; i++) {
      const letter = document.createElement("div");
      letter.className = "random-letter";
      letter.textContent = letters[Math.floor(Math.random() * letters.length)];

      letter.style.cssText = `
        position: absolute;
        left: ${Math.random() * 80}%;
        top: ${Math.random() * 80}%;
        background: rgba(17, 24, 39, 0.04);
        border: 1px solid rgba(46, 125, 50, 0.15);
        border-radius: 8px;
        padding: 8px 12px;
        color: rgba(17, 24, 39, 0.25);
        font-weight: 600;
        font-size: 18px;
        text-shadow: 0 0 10px rgba(46, 125, 50, 0.2);
        animation: gentle-bounce 6s ease-in-out infinite;
        animation-delay: ${Math.random() * 3}s;
        min-width: 35px;
        text-align: center;
        transition: all 0.3s ease;
        z-index: 1;
      `;

      container.appendChild(letter);
    }
  };

  const refreshMatrixRain = () => {
    generateMatrixRain();
  };

  const refreshFloatingElements = () => {
    const container = document.getElementById("floatingContainer");
    if (!container) return;

    const letters = container.querySelectorAll(".random-letter");
    const letterChars =
      "ABCDEFGHJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz123456789";

    letters.forEach((letter) => {
      if (Math.random() < 0.3) {
        letter.textContent =
          letterChars[Math.floor(Math.random() * letterChars.length)];
        letter.style.opacity = "0.8";
        setTimeout(() => {
          letter.style.opacity = "";
        }, 200);
      }
    });
  };

  return (
    <div className="min-h-screen  flex items-center justify-center p-4">
      <style>{`
        
        
        .blueprint-grid {
          background-image: 
            linear-gradient(rgba(46, 125, 50, 0.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(46, 125, 50, 0.05) 1px, transparent 1px);
          background-size: 40px 40px;
        }
        
        .glass-card {
          background: #ffffff;
          border: 1px solid #e5e7eb;
          backdrop-filter: blur(20px);
          border-radius: 24px;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
        }
        
        .input-field {
          background: #ffffff !important;
          border: 1px solid #e5e7eb !important;
          color: #111827 !important;
        }
        
        .input-field:focus {
          border-color: hsl(var(--primary)) !important;
          box-shadow: 0 0 0 3px rgba(46, 125, 50, 0.25) !important;
          background: #ffffff !important;
        }
        
        .input-field::placeholder {
          color: #9ca3af !important;
        }
        
        .btn-primary {
          background: linear-gradient(135deg, var(--brand) 0%, var(--brand-dark) 100%) !important;
          color: var(--brand-foreground) !important;
          font-weight: 700 !important;
          box-shadow: 0 8px 25px rgba(46, 125, 50, 0.25) !important;
          position: relative;
          overflow: hidden;
        }
        
        .btn-primary::before {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
          transition: left 0.5s;
        }
        
        .btn-primary:hover:not(:disabled)::before {
          left: 100%;
        }
        
        .btn-primary:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 12px 35px rgba(46, 125, 50, 0.25) !important;
        }
        
        .btn-secondary {
          background: #ffffff !important;
          border: 1px solid #e5e7eb !important;
          color: #111827 !important;
        }
        
        .btn-secondary:hover {
          background: #ffffff !important;
          border-color: #d1d5db !important;
          transform: translateY(-1px);
        }
        
        .hero-illustration {
          background: linear-gradient(135deg, rgba(46, 125, 50, 0.2) 0%, rgba(46, 125, 50, 0.2) 100%);
          border-radius: 20px;
          padding: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          overflow: hidden;
        }
        
        .hero-illustration::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-image: 
            linear-gradient(rgba(46, 125, 50, 0.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(46, 125, 50, 0.05) 1px, transparent 1px);
          background-size: 20px 20px;
        }
        
        .signage-letters {
          position: relative;
          z-index: 2;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 24px;
        }
        
        .letter-row {
          display: flex;
          gap: 16px;
          align-items: center;
        }
        
        .letter-block {
          background: rgba(255, 255, 255, 0.1);
          border: 2px solid rgba(46, 125, 50, 0.15);
          border-radius: 12px;
          padding: 20px 24px;
          color: white;
          font-weight: 800;
          font-size: 32px;
          text-shadow: 0 0 20px rgba(46, 125, 50, 0.2);
          animation: float 3s ease-in-out infinite;
          min-width: 70px;
          text-align: center;
          transition: all 0.3s ease;
        }
        
        .letter-block:hover {
          transform: translateY(-5px) scale(1.05);
          border-color: rgba(46, 125, 50, 0.2);
          box-shadow: 0 10px 30px rgba(46, 125, 50, 0.25);
        }
        
        .letter-row:first-child .letter-block:nth-child(1) { animation-delay: 0s; }
        .letter-row:first-child .letter-block:nth-child(2) { animation-delay: 0.2s; }
        .letter-row:first-child .letter-block:nth-child(3) { animation-delay: 0.4s; }
        .letter-row:first-child .letter-block:nth-child(4) { animation-delay: 0.6s; }
        .letter-row:last-child .letter-block:nth-child(1) { animation-delay: 0.8s; }
        .letter-row:last-child .letter-block:nth-child(2) { animation-delay: 1.0s; }
        .letter-row:last-child .letter-block:nth-child(3) { animation-delay: 1.2s; }
        
        .checkbox-custom[data-state="checked"] {
          background: linear-gradient(135deg, var(--brand) 0%, var(--brand-dark) 100%) !important;
          border-color: var(--brand) !important;
        }
        
        .logo-glow {
          filter: drop-shadow(0 0 20px rgba(46, 125, 50, 0.2));
        }
        
        .circuit-lines {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-image: 
            linear-gradient(90deg, rgba(46, 125, 50, 0.25) 1px, transparent 1px),
            linear-gradient(0deg, rgba(46, 125, 50, 0.25) 1px, transparent 1px),
            linear-gradient(45deg, rgba(46, 125, 50, 0.2) 1px, transparent 1px);
          background-size: 60px 60px, 60px 60px, 40px 40px;
          animation: circuit-pulse 4s ease-in-out infinite;
          pointer-events: none;
          z-index: 0;
        }
        
        .glitch-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: 
            linear-gradient(90deg, transparent 98%, rgba(46, 125, 50, 0.25) 100%),
            linear-gradient(0deg, transparent 98%, rgba(46, 125, 50, 0.2) 100%);
          animation: glitch-scan 3s linear infinite;
          pointer-events: none;
          z-index: 1;
        }
        
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }
        
        @keyframes gentle-bounce {
          0%, 100% { transform: translateY(0px) translateX(0px) rotate(0deg); }
          25% { transform: translateY(-15px) translateX(8px) rotate(2deg); }
          50% { transform: translateY(-8px) translateX(-5px) rotate(-1deg); }
          75% { transform: translateY(-20px) translateX(12px) rotate(1.5deg); }
        }
        
        @keyframes matrix-fall {
          0% { transform: translateY(-100vh); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateY(100vh); opacity: 0; }
        }
        
        @keyframes circuit-pulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.6; }
        }
        
        @keyframes glitch-scan {
          0%, 100% { transform: translateY(0); opacity: 0; }
          50% { transform: translateY(-100%); opacity: 0.1; }
        }
        
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        @keyframes fadeInLeft {
          from { opacity: 0; transform: translateX(-30px); }
          to { opacity: 1; transform: translateX(0); }
        }
        
        @keyframes fadeInRight {
          from { opacity: 0; transform: translateX(30px); }
          to { opacity: 1; transform: translateX(0); }
        }
        
        .animate-fade-in-up { animation: fadeInUp 0.6s ease-out; }
        .animate-fade-in-left { animation: fadeInLeft 0.6s ease-out; }
        .animate-fade-in-right { animation: fadeInRight 0.6s ease-out; }
      `}</style>

      <Card className="glass-card w-full max-w-6xl animate-fade-in-up border-border/10">
        <CardContent className="p-0">
          <div className="grid lg:grid-cols-2 gap-0">
            {/* Left Side - Hero Illustration */}
            <div className="p-8 lg:p-12 animate-fade-in-left lg:block hidden">
              <div className="hero-illustration h-full min-h-[400px] lg:min-h-[600px] relative">
                {/* Matrix Rain Background */}
                <div
                  id="matrixRain"
                  className="absolute inset-0 overflow-hidden pointer-events-none z-0"
                />

                {/* Circuit Lines */}
                <div className="circuit-lines" />

                {/* Glitch Overlay */}
                <div className="glitch-overlay" />

                {/* Floating Container */}
                <div
                  id="floatingContainer"
                  className="absolute inset-0 pointer-events-none z-10"
                />

                {/* Letter tiles spell the BRAND, not the engine vendor. */}
                <div className="signage-letters">
                  <div className="letter-row">
                    {brandRows[0].map((ch, i) => (
                      <div className="letter-block" key={`r0-${i}`}>
                        {ch}
                      </div>
                    ))}
                  </div>
                  <div className="letter-row">
                    {brandRows[1].map((ch, i) => (
                      <div className="letter-block" key={`r1-${i}`}>
                        {ch}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Right Side - Login Form */}
            <div className="p-8 lg:p-12 animate-fade-in-right">
              {/* Header */}
              <div className="text-center mb-8">
                {/* Co-branded lockup — the engine vendor is never shown. */}
                <div className="mb-4 flex flex-col items-center justify-center gap-2">
                  <span
                    className="w-12 h-12 rounded-full grid place-items-center"
                    style={{ background: "var(--brand-light)" }}
                  >
                    <Leaf size={24} style={{ color: "var(--brand)" }} />
                  </span>
                  <h1
                    className="text-3xl font-bold"
                    style={{ color: "var(--brand)" }}
                  >
                    {DEFAULT_BRAND.name}
                  </h1>
                  <p className="text-[11px] text-muted-foreground">
                    {PRODUCT_NAME} ·{" "}
                    <span className="font-semibold">
                      {DEFAULT_BRAND.operator}
                    </span>
                  </p>
                </div>
                <p className="text-muted-foreground text-sm mt-5">
                  Login Portal
                </p>
              </div>

              {/* Server Error */}
              {serverError && (
                <Alert className="mb-6 border-destructive/20 bg-destructive/10">
                  <AlertDescription className="text-destructive">
                    {serverError}
                  </AlertDescription>
                </Alert>
              )}

              {/* Login Form */}
              <form onSubmit={onSubmit} className="space-y-6">
                {/* Email */}
                <div className="space-y-2">
                  <Label
                    htmlFor="email"
                    className="text-foreground text-md font-medium"
                  >
                    Email Address
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="john@yoursigncompany.com"
                    className="input-field py-7"
                    value={formData?.email || ""}
                    name="email"
                    onChange={handleFormData}
                  />
                  {errors?.email && (
                    <p className="text-destructive text-sm">{errors?.email}</p>
                  )}
                </div>

                {/* Password */}
                <div className="space-y-2">
                  <Label
                    htmlFor="password"
                    className="text-foreground text-md font-medium"
                  >
                    Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      className="input-field pr-12 py-7 text-md"
                      value={formData?.password || ""}
                      name="password"
                      onChange={handleFormData}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  {errors?.password && (
                    <p className="text-destructive text-sm">
                      {errors?.password}
                    </p>
                  )}
                </div>

                {/* Submit */}
                <Button
                  type="submit"
                  disabled={loading}
                  size="xlg"
                  className="btn-primary w-full"
                >
                  {loading ? "Logging in..." : "Log in"}
                </Button>
              </form>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;
