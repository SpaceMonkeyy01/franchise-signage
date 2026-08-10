import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOutUserAction } from "../store/action/UserLoginAction";
import { useRole } from "../hooks/useRole";
import { ROLE_LABELS } from "../config/roles";

// Top-right profile menu — avatar + account details + logout. The tenant
// (company) name was dropped along with the CRM backend that served the company
// list; identity and sign-out are all the studio needs.
const ProfileMenu = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const user = useSelector((state) => state.User?.user);
  const role = useRole();

  const initial = user?.name?.[0]?.toUpperCase() ?? "U";

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger className="outline-none">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center">
            <span className="text-white font-bold text-xs">{initial}</span>
          </div>
          <div className="hidden md:flex flex-col leading-tight text-left">
            <span className="text-foreground text-sm font-medium">
              {user?.name ?? "Account"}
            </span>
          </div>
          <span className="text-gray-400 text-xs hidden md:block">▼</span>
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 mt-2">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="text-foreground">{user?.name ?? "Account"}</span>
          {user?.email && (
            <span className="text-xs text-gray-400 font-normal">
              {user.email}
            </span>
          )}
          <span className="text-xs text-primary font-normal mt-1">
            {ROLE_LABELS[role] ?? role}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-red-400 focus:text-red-300 cursor-pointer"
          onClick={() => dispatch(LogOutUserAction({ navigate }))}
        >
          <LogOut className="w-4 h-4 mr-2" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ProfileMenu;
