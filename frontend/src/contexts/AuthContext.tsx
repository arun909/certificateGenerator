import React, { createContext, useContext, useState, useEffect } from "react";

interface User {
    role: "SUPER_ADMIN" | "ADMIN" | "CUSTOMER";
    customer_id?: string;
    customer_name?: string;
    email: string;
}

interface LicenseWarning {
    message: string;
    expiry_date: string;
}

interface AuthContextType {
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (email: string, password: string, rememberMe: boolean) => Promise<void>;
    logout: () => void;
    licenseWarning: LicenseWarning | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(() => {
        const saved = localStorage.getItem("auth_user");
        return saved ? JSON.parse(saved) : null;
    });
    const [isAuthenticated, setIsAuthenticated] = useState(() => {
        return localStorage.getItem("is_authenticated") === "true";
    });
    const [isLoading, setIsLoading] = useState(true);
    const [licenseWarning, setLicenseWarning] = useState<LicenseWarning | null>(null);

    useEffect(() => {
        // Simulate check auth or additional initialization
        setIsLoading(false);
    }, []);

    const login = async (email: string, password: string, _rememberMe: boolean) => {
        try {
            const response = await fetch("/fms-api/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password })
            });

            if (!response.ok) {
                let errorMessage = "Invalid email or password";
                try {
                    const errorData = await response.json();
                    errorMessage = errorData.error || errorMessage;
                } catch (e) {
                    console.error("Failed to parse error response as JSON:", e);
                    errorMessage = `Server Error: ${response.status} ${response.statusText}`;
                }
                throw new Error(errorMessage);
            }

            const data = await response.json();
            const newUser: User = data.user;

            setUser(newUser);
            setIsAuthenticated(true);
            localStorage.setItem("auth_user", JSON.stringify(newUser));
            localStorage.setItem("is_authenticated", "true");

            // Simulate a license warning for demo purposes
            setLicenseWarning({
                message: "Your license will expire in 15 days.",
                expiry_date: "2026-04-25"
            });
        } catch (error) {
            throw error;
        }
    };

    const logout = () => {
        setUser(null);
        setIsAuthenticated(false);
        localStorage.removeItem("auth_user");
        localStorage.removeItem("is_authenticated");
    };

    return (
        <AuthContext.Provider value={{ user, isAuthenticated, isLoading, login, logout, licenseWarning }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
};
