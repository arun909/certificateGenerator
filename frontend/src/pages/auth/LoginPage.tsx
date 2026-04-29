import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, Mail, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import celerCover from "@/assets/login_panel_doodles.svg";
import conqueLogo from "@/assets/fms_authenticator_logo_fixed.svg";
import trizLogo from "@/assets/trizlogo.png";

interface LoginViewProps {
    logoSrc?: string;
    bannerSrc?: string;
    loginSource?: string;
    logoClassName?: string;
    poweredByLogoSrc?: string;
    buttonClassName?: string;
}

const LoginPage: React.FC<LoginViewProps> = ({
    logoSrc = conqueLogo,
    bannerSrc = celerCover,
    loginSource,
    logoClassName,
    poweredByLogoSrc = trizLogo,
    buttonClassName = "bg-gradient-to-r from-purple-700 to-blue-700"
}) => {
    const [isMounted, setIsMounted] = useState(false);
    const [isCheckingAuth, setIsCheckingAuth] = useState(true);
    const navigate = useNavigate();
    const { user, isAuthenticated, isLoading, login } = useAuth();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [rememberMe, setRememberMe] = useState(false);
    const [errors, setErrors] = useState<{ username?: string; password?: string }>(
        {}
    );
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        setIsMounted(true);
        if (loginSource) {
            localStorage.setItem("iot_login_source", loginSource);
        }
    }, [loginSource]);

    useEffect(() => {
        if (!isMounted) return;

        if (!isLoading) {
            if (isAuthenticated && user) {
                redirectToDashboard();
            }
            setIsCheckingAuth(false);
        }
    }, [isLoading, isAuthenticated, user, isMounted]);

    const redirectToDashboard = () => {
        if (user?.role === "SUPER_ADMIN") {
            navigate("/admin");
        } else {
            navigate("/dashboard");
        }
    };

    if (!isMounted || isCheckingAuth || isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-16 w-16 border-4 border-gray-200 border-t-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600 font-semibold">Loading...</p>
                </div>
            </div>
        );
    }



    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (isSubmitting) return;

        if (isAuthenticated && user) {
            redirectToDashboard();
            return;
        }

        setErrors({});

        const newErrors: { username?: string; password?: string } = {};

        if (!username) {
            newErrors.username = "Username is required";
        }

        if (!password) {
            newErrors.password = "Password is required";
        } else if (password.length < 6) {
            newErrors.password = "Password must be at least 6 characters";
        }

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }

        setIsSubmitting(true);

        try {
            await login(username, password, rememberMe);
        } catch (error: any) {
            console.error("Login error caught:", error);
            setErrors({});
            const errorMessage = error?.message || "Login failed. Please try again.";

            if (errorMessage.toLowerCase().includes("license")) {
                setErrors({ username: errorMessage });
            } else if (
                errorMessage.toLowerCase().includes("invalid") ||
                errorMessage.toLowerCase().includes("unauthorized") ||
                errorMessage.toLowerCase().includes("authentication") ||
                errorMessage.toLowerCase().includes("failed")
            ) {
                setErrors({
                    username: "Invalid username or password",
                    password: "Invalid username or password",
                });
            } else {
                setErrors({ username: errorMessage });
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen flex font-sans overflow-hidden" style={{ background: "linear-gradient(145deg, #f8fafc 0%, #f0f4ff 55%, #f0fdfa 100%)" }}>
            {/* Left Panel - Login Form */}
            <div className="flex-1 flex flex-col justify-center items-center p-6 lg:p-12 overflow-y-auto">
                <div className="w-full max-w-md">
                    <div className="mb-10 text-center">
                        <img
                            src={logoSrc}
                            alt="Company Logo"
                            className={cn("w-80 h-32 object-contain mx-auto mb-5 drop-shadow-sm", logoClassName)}
                            onError={(e) => {
                                (e.target as HTMLImageElement).src = "https://placehold.co/400x150/png?text=ConQue+fms";
                            }}
                        />
                        <div className="flex items-center gap-3 justify-center mb-3">
                            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
                        </div>
                        <p className="text-sm text-slate-500 tracking-wide">
                            Sign in to securely generate product certificates.
                        </p>
                    </div>
                    <div
                        style={{
                            background: "linear-gradient(160deg, rgba(255,255,255,0.92) 0%, rgba(240,249,255,0.88) 50%, rgba(240,253,250,0.88) 100%)",
                            boxShadow: "0 8px 32px 0 rgba(99,102,241,0.10), 0 2px 8px 0 rgba(6,182,212,0.08), inset 0 1px 0 rgba(255,255,255,0.9)",
                            backdropFilter: "blur(20px) saturate(1.6)",
                            WebkitBackdropFilter: "blur(20px) saturate(1.6)",
                        }}
                        className="border border-slate-200/70 rounded-2xl p-8 max-w-md w-full mx-auto"
                    >
                        <form
                            onSubmit={handleSubmit}
                            className="space-y-6"
                            noValidate
                            autoComplete="off"
                        >
                            <div>
                                <label
                                    htmlFor="username"
                                    className="text-sm font-medium text-gray-700"
                                >
                                    Username
                                </label>
                                <div className="mt-2 relative">
                                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                    <input
                                        id="username"
                                        type="text"
                                        autoComplete="username"
                                        required
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        className={cn(
                                            "w-full pl-12 pr-4 py-3.5 rounded-xl bg-slate-50/80 border border-slate-200 focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none transition-all text-sm text-slate-800 placeholder:text-slate-400 shadow-sm",
                                            errors.username && "border-red-400 bg-red-50/60"
                                        )}
                                        placeholder="Enter your username"
                                    />
                                </div>
                            </div>

                            <div>
                                <div className="flex justify-between items-center">
                                    <label
                                        htmlFor="password"
                                        className="text-sm font-medium text-gray-700"
                                    >
                                        Password
                                    </label>
                                </div>
                                <div className="mt-2 relative">
                                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                    <input
                                        id="password"
                                        type={showPassword ? "text" : "password"}
                                        autoComplete="current-password"
                                        required
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className={cn(
                                            "w-full pl-12 pr-12 py-3.5 rounded-xl bg-slate-50/80 border border-slate-200 focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none transition-all text-sm text-slate-800 placeholder:text-slate-400 shadow-sm",
                                            errors.password && "border-red-400 bg-red-50/60"
                                        )}
                                        placeholder="Enter your password"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                                    >
                                        {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                    </button>
                                </div>
                                {errors.password && (
                                    <p className="mt-2 text-sm text-red-600 text-center">
                                        {errors.password}
                                    </p>
                                )}
                            </div>

                            <div className="flex items-center">
                                <input
                                    id="remember-me"
                                    type="checkbox"
                                    checked={rememberMe}
                                    onChange={(e) => setRememberMe(e.target.checked)}
                                    className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                />
                                <label
                                    htmlFor="remember-me"
                                    className="ml-2 block text-sm text-gray-900"
                                >
                                    Remember me
                                </label>
                            </div>

                            <div>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    onClick={(e) => {
                                        e.preventDefault();
                                        handleSubmit(e);
                                    }}
                                    className={cn(
                                        "w-full py-4 px-4 rounded-xl text-white font-semibold hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-transform transform hover:scale-[1.02] disabled:bg-blue-400 disabled:cursor-not-allowed shadow-lg shadow-blue-500/30",
                                        buttonClassName
                                    )}
                                >
                                    {isSubmitting ? (
                                        <div className="flex items-center justify-center">
                                            <div className="w-5 h-5 border-2 border-t-transparent border-white rounded-full animate-spin mr-3"></div>
                                            <span>Signing In...</span>
                                        </div>
                                    ) : (
                                        "Sign In"
                                    )}
                                </button>


                            </div>

                            {errors.username && !errors.password && (
                                <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200">
                                    <p className="text-sm text-red-600 text-center">
                                        {errors.username}
                                    </p>
                                </div>
                            )}
                        </form>
                    </div>
                </div>
                {poweredByLogoSrc && (
                    <div className="mt-12 text-center">
                        <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-2">Powered by</p>
                        <img
                            src={poweredByLogoSrc}
                            alt="Powered by"
                            className="h-10 object-contain mx-auto opacity-80 hover:opacity-100 transition-opacity"
                        />
                    </div>
                )}
            </div>

            {/* Right Panel - Doodle + Gradient */}
            <div className="hidden lg:flex flex-1 relative bg-gradient-to-br from-teal-500 via-cyan-500 to-blue-600 overflow-hidden">

                {/* Layer 1 — doodle SVG blended into gradient via multiply */}
                <div className="absolute inset-0 z-0">
                    <img
                        src={bannerSrc}
                        alt="Decorative doodles"
                        className="w-full h-full object-cover"
                        style={{ mixBlendMode: "multiply", opacity: 0.72 }}
                        onError={(e) => {
                            (e.target as HTMLImageElement).src = "https://placehold.co/800x1200/png?text=Fleet+Management";
                        }}
                    />
                </div>

                {/* Layer 2 — frosted glass shimmer for premium depth */}
                <div
                    className="absolute inset-0 z-10"
                    style={{
                        backdropFilter: "blur(2.5px) saturate(1.4)",
                        WebkitBackdropFilter: "blur(2.5px) saturate(1.4)",
                        background: "linear-gradient(135deg, rgba(20,184,166,0.10) 0%, rgba(6,182,212,0.08) 50%, rgba(37,99,235,0.13) 100%)",
                    }}
                />

                {/* Layer 3 — bottom dark scrim so text stays legible */}
                <div className="absolute inset-0 bg-gradient-to-t from-teal-950/80 via-teal-900/20 to-transparent z-20" />

                {/* Layer 4 — text content */}
                <div className="absolute bottom-16 left-12 right-12 text-white z-30">
                    <h3 className="text-4xl font-bold mb-6 drop-shadow-lg">
                        Certificate Generator &amp; Authenticator
                    </h3>
                    <p className="text-xl text-teal-100 leading-relaxed max-w-lg drop-shadow">
                        Generate, manage, and verify certificates for all your devices while keeping everything organized and secure.
                    </p>
                    <div className="mt-10 flex items-center space-x-8">
                        <div className="flex items-center space-x-3">
                            <div className="w-3 h-3 bg-emerald-400 rounded-full animate-pulse shadow-lg shadow-emerald-400/50"></div>
                            <span className="text-base text-teal-100 font-medium">
                                Smart Certificate Management
                            </span>
                        </div>
                        <div className="flex items-center space-x-3">
                            <div className="w-3 h-3 bg-cyan-300 rounded-full animate-pulse shadow-lg shadow-cyan-300/50"></div>
                            <span className="text-base text-teal-100 font-medium">
                                Secure Device Organization
                            </span>
                        </div>
                    </div>
                </div>
            </div>

        </div>
    );
};

export default LoginPage;
