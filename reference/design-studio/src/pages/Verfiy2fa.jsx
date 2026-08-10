import { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";
import API from "../json/apiConfig.js";
import {
  localStorageIs2faVerified,
  localStorageTokenKey,
} from "../utils/localStorageTokenKey";
import { setUserAction } from "../store/Slices/UserSlice";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";

import { REGEXP_ONLY_DIGITS_AND_CHARS } from "input-otp";

import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";

const Verfiy2fa = () => {
  const [errors, setErrors] = useState(null);
  const [verification_token, set_verification_token] = useState(null);

  console.log("verification_token", verification_token);

  const [apiError, setApiError] = useState(null);
  const [apiLoading, setApiLoading] = useState(false);

  const dispatch = useDispatch();
  const navigate = useNavigate();

  useEffect(() => {
    if (apiError) {
      setTimeout(() => {
        setApiError(null);
      }, 3000);
    }
  }, [apiError]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (
      verification_token == null ||
      verification_token?.trim() == "" ||
      verification_token?.length !== 6
    ) {
      setErrors("Complete Verification Token is required");
      return;
    } else {
      setErrors(null);
    }
    try {
      setApiLoading(true);
      const token = localStorage.getItem(localStorageTokenKey);
      const apiRequest = await axios.post(
        API.BACKEND_API_URL + "/verify-2fa",
        {
          code: verification_token,
        },
        {
          headers: {
            Authorization: "Bearer " + token,
          },
        }
      );
      const apiResponse = await apiRequest.data;
      if (apiResponse?.success == true) {
        dispatch(setUserAction(apiResponse?.user));
        localStorage.setItem(localStorageIs2faVerified, "true");
        navigate("/");
      }

      setApiLoading(false);
    } catch (err) {
      setApiLoading(false);
      console.log("err", err);
      toast.error(err?.response?.data?.message);
    }
  };

  return (
    <div className="flex justify-center items-center min-h-screen ">
      <Dialog open={true}>
        <DialogContent hideOverlaybg={true} showCloseButton={false}>
          <form onSubmit={handleSubmit}>
            <DialogHeader className={cn("my-3")}>
              <DialogTitle className={cn("text-center md:text-2xl mb-10")}>
                Verify Token
              </DialogTitle>
            </DialogHeader>
            <div>
              <InputOTP
                maxLength={6}
                pattern={REGEXP_ONLY_DIGITS_AND_CHARS}
                value={verification_token}
                onChange={(value) => set_verification_token(value)}
              >
                <InputOTPGroup
                  className={cn("flex items-center justify-center w-full")}
                >
                  <InputOTPSlot
                    className={cn("h-14 w-14 text-2xl")}
                    index={0}
                  />
                  <InputOTPSlot
                    className={cn("h-14 w-14 text-2xl")}
                    index={1}
                  />
                  <InputOTPSlot
                    className={cn("h-14 w-14 text-2xl")}
                    index={2}
                  />
                  <InputOTPSlot
                    className={cn("h-14 w-14 text-2xl")}
                    index={3}
                  />
                  <InputOTPSlot
                    className={cn("h-14 w-14 text-2xl")}
                    index={4}
                  />
                  <InputOTPSlot
                    className={cn("h-14 w-14 text-2xl")}
                    index={5}
                  />
                </InputOTPGroup>
              </InputOTP>

              {errors && (
                <p className="text-destructive text-center mt-3 text-sm">
                  {errors}
                </p>
              )}
            </div>

            <DialogFooter className={cn("mt-6")}>
              <Button type="submit" size="lg" className="btn-primary">
                {apiLoading && <Loader2Icon className="animate-spin" />}
                Submit
              </Button>
            </DialogFooter>

            <div className="text-center mt-10">
              <Link to={"/login"} className=" underline   mt-10">
                Go Back
              </Link>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Verfiy2fa;
