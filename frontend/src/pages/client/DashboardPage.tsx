import React, { useState, useEffect } from 'react';
import { QrCode, Upload, LogOut, LayoutDashboard, X, Loader2, CheckCircle2, Download } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import conqueLogo from "@/assets/conque.png";

const DashboardPage: React.FC = () => {
    const { logout, user } = useAuth();
    const navigate = useNavigate();
    const [isScanning, setIsScanning] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [lastGenerated, setLastGenerated] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
    const [deviceDetails, setDeviceDetails] = useState<any | null>(null);
    const [cameraError, setCameraError] = useState<string | null>(null);

    const [applications, setApplications] = useState<any[]>([]);
    const [devices, setDevices] = useState<any[]>([]);
    const [limits, setLimits] = useState<{ app_limit: number; device_limit: number } | null>(null);
    const [isLoadingAssets, setIsLoadingAssets] = useState(true);

    const fetchMyAssets = async () => {
        if (!user?.customer_id) return;
        try {
            const [statsRes, appsRes, devsRes] = await Promise.all([
                fetch(`/fms-api/api/customers/${user.customer_id}/stats`),
                fetch(`/fms-api/api/applications?customer_id=${user.customer_id}`),
                fetch(`/fms-api/api/devices?customer_id=${user.customer_id}`)
            ]);
            if (statsRes.ok) {
                const stats = await statsRes.json();
                setLimits({ app_limit: stats.app_limit || 5, device_limit: stats.device_limit || 10 });
            }
            if (appsRes.ok) setApplications(await appsRes.json());
            if (devsRes.ok) setDevices(await devsRes.json());
        } catch (err) {
            console.error("Failed to fetch assets:", err);
        } finally {
            setIsLoadingAssets(false);
        }
    };

    useEffect(() => {
        if (!user?.customer_id) {
            setIsLoadingAssets(false);
            return;
        }
        fetchMyAssets();

        // Refetch whenever user comes back to this tab
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                fetchMyAssets();
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [user?.customer_id]);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    useEffect(() => {
        return () => {
            if (downloadUrl) {
                window.URL.revokeObjectURL(downloadUrl);
            }
        };
    }, [downloadUrl]);

    useEffect(() => {
        let html5QrCode: Html5Qrcode | null = null;
        let isSubscribed = true;

        const startScanner = async () => {
            if (!isScanning) return;

            // Wait until the element is actually in the DOM
            let attempts = 0;
            while (attempts < 10 && !document.getElementById("qr-reader")) {
                await new Promise(r => setTimeout(r, 100));
                attempts++;
            }

            if (!document.getElementById("qr-reader") || !isSubscribed) return;

            setCameraError(null);
            try {
                html5QrCode = new Html5Qrcode("qr-reader");
                const devices = await Html5Qrcode.getCameras();

                if (devices && devices.length > 0 && isSubscribed) {
                    const cameraId = devices[0].id;
                    await html5QrCode.start(
                        cameraId,
                        {
                            fps: 10,
                            qrbox: { width: 250, height: 250 },
                        },
                        (decodedText) => {
                            if (isSubscribed) onScanSuccess(decodedText);
                        },
                        () => { }
                    );
                } else if (isSubscribed) {
                    setCameraError("No cameras detected. Please ensure your camera is connected.");
                }
            } catch (err: any) {
                console.error("Camera access error:", err);
                if (!isSubscribed) return;

                const errStr = err.toString();
                if (errStr.includes("Permission")) {
                    setCameraError("Camera access denied. Please click the camera icon in your browser address bar to allow access.");
                } else if (errStr.includes("NotReadableError")) {
                    setCameraError("Camera is already in use by another application or tab.");
                } else {
                    setCameraError("Failed to initialize camera. (" + errStr + ")");
                }
            }
        };

        startScanner();

        return () => {
            isSubscribed = false;
            if (html5QrCode) {
                const stopAndClear = async () => {
                    try {
                        if (html5QrCode?.isScanning) {
                            await html5QrCode.stop();
                        }
                        await html5QrCode?.clear();
                    } catch (e) {
                        console.error("Cleanup error:", e);
                    }
                };
                stopAndClear();
            }
        };
    }, [isScanning]);

    const onScanSuccess = async (decodedText: string) => {
        console.log("Scan Success:", decodedText);
        setIsScanning(false);
        await handleGenerateCertificate(decodedText);
    };

    const handleGenerateCertificate = async (qrData: string) => {
        setIsGenerating(true);
        setError(null);
        setLastGenerated(null);
        setDownloadUrl(null);

        try {
            console.log("Sending QR data to backend. customer_id:", user?.customer_id);
            const response = await fetch('/fms-api/api/generate-certificate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    qrData,
                    userContext: {
                        customer_id: user?.customer_id,
                        customer_name: user?.customer_name
                    }
                })
            });

            const data = await response.json();

            if (!response.ok) {
                console.error("Backend Error Response:", data);
                throw new Error(data.error || `Server responded with ${response.status}`);
            }

            // Convert base64 to blob
            const byteCharacters = atob(data.zip_data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: 'application/zip' });

            const url = window.URL.createObjectURL(blob);

            setDownloadUrl(url);
            setLastGenerated(data.filename);
            setDeviceDetails(data.details);

            console.log("Certificate package ready for download:", data.filename);
        } catch (err: any) {
            console.error(err);
            setError(err.message);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsGenerating(true);
        setError(null);
        setLastGenerated(null);
        setDownloadUrl(null);

        // Create a temporary scanner to process the file
        const html5QrCode = new Html5Qrcode("reader-hidden");

        try {
            const decodedText = await html5QrCode.scanFile(file, true);
            console.log("File Scan Success:", decodedText);
            await handleGenerateCertificate(decodedText);
        } catch (err: any) {
            console.error("File Scan Error:", err);
            setError("Could not find a valid QR code in this image. Please try another photo.");
            setIsGenerating(false);
        } finally {
            // Clean up the temporary scanner instance if needed
            // (scanFile is static-like in behavior but needs a div to work in some versions)
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
            {/* Top Navbar */}
            <nav className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between sticky top-0 z-10 shadow-sm">
                <div className="flex items-center space-x-4">
                    <img src={conqueLogo} alt="Logo" className="h-10 object-contain" />
                    <div className="h-6 w-[1px] bg-slate-200 hidden md:block"></div>
                    <div className="hidden md:flex items-center space-x-2 text-slate-600">
                        <LayoutDashboard size={18} />
                        <span className="font-medium">Dashboard</span>
                    </div>
                </div>

                <div className="flex items-center space-x-4">
                    <div className="hidden sm:flex flex-col items-end mr-2">
                        <span className="text-sm font-semibold text-slate-800">{user?.customer_name || 'User'}</span>
                        <span className="text-xs text-slate-500">{user?.role || 'Guest'}</span>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="flex items-center space-x-2 px-3 py-2 rounded-lg text-slate-600 hover:bg-red-50 hover:text-red-600 transition-colors"
                    >
                        <LogOut size={18} />
                        <span className="hidden sm:inline font-medium text-sm">Logout</span>
                    </button>
                </div>
            </nav>

            {/* Main Content */}
            <main className="flex-1 max-w-5xl w-full mx-auto p-6 md:p-12 mb-10">
                <header className="mb-10">
                    <h1 className="text-3xl font-bold text-slate-900 mb-2">Welcome Back!</h1>
                    <p className="text-slate-500">Choose an option below to manage your QR operations.</p>
                </header>

                {error && (
                    <div className="mb-8 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center space-x-3 text-red-600 animate-in fade-in slide-in-from-top-2">
                        <X size={20} className="shrink-0" />
                        <p className="text-sm font-medium">{error}</p>
                    </div>
                )}

                {lastGenerated && (
                    <div className="mb-8 p-6 bg-white border border-emerald-100 rounded-[2rem] shadow-xl shadow-emerald-500/10 animate-in fade-in slide-in-from-top-4">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center space-x-3 text-emerald-600">
                                <div className="bg-emerald-100 p-2 rounded-xl">
                                    <CheckCircle2 size={24} />
                                </div>
                                <h3 className="text-xl font-bold text-slate-900">Package Ready</h3>
                            </div>
                            <button
                                onClick={() => {
                                    setLastGenerated(null);
                                    setDownloadUrl(null);
                                    setDeviceDetails(null);
                                }}
                                className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {deviceDetails && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Device Name</span>
                                    <span className="text-slate-900 font-bold">{deviceDetails.device_name}</span>
                                </div>
                                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Device ID</span>
                                    <span className="text-slate-900 font-medium truncate block">{deviceDetails.device_id}</span>
                                </div>
                                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Endpoint ID</span>
                                    <span className="text-slate-900 font-medium truncate block">{deviceDetails.endpoint_id}</span>
                                </div>
                                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">App Version</span>
                                    <span className="text-slate-900 font-bold">{deviceDetails.app_version}</span>
                                </div>
                            </div>
                        )}

                        <div className="flex items-center justify-between p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                            <div className="flex items-center space-x-3 text-emerald-700">
                                <Download size={20} />
                                <span className="text-sm font-bold">{lastGenerated}</span>
                            </div>
                            {downloadUrl && (
                                <a
                                    href={downloadUrl}
                                    download={lastGenerated}
                                    className="flex items-center space-x-2 px-6 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition-all hover:scale-[1.05] shadow-lg shadow-emerald-500/20"
                                >
                                    <span>Download Now</span>
                                </a>
                            )}
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Scan QR Card */}
                    <button
                        onClick={() => setIsScanning(true)}
                        className="group relative flex flex-col items-center justify-center p-10 bg-white border-2 border-slate-100 rounded-3xl shadow-xl shadow-slate-200/50 hover:border-blue-500 transition-all hover:scale-[1.02] cursor-pointer overflow-hidden"
                    >
                        {isGenerating && (
                            <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-20 flex flex-col items-center justify-center space-y-4">
                                <Loader2 size={40} className="text-blue-600 animate-spin" />
                                <p className="text-slate-900 font-bold">Generating Package...</p>
                            </div>
                        )}

                        <div className="w-20 h-20 bg-blue-50 rounded-2xl flex items-center justify-center mb-6 text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                            <QrCode size={40} />
                        </div>
                        <h2 className="text-2xl font-bold text-slate-900 mb-2">Scan QR</h2>
                        <p className="text-center text-slate-500 max-w-[240px]">
                            Use your device camera to scan a QR code instantly.
                        </p>
                        <div className="mt-8 flex items-center text-blue-600 font-semibold text-sm">
                            Launch Scanner
                            <svg className="ml-2 w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                            </svg>
                        </div>
                    </button>

                    {/* Upload QR Card */}
                    <div className="group relative flex flex-col items-center justify-center p-10 bg-white border-2 border-slate-100 rounded-3xl shadow-xl shadow-slate-200/50 hover:border-purple-500 transition-all hover:scale-[1.02] cursor-pointer">
                        <div className="w-20 h-20 bg-purple-50 rounded-2xl flex items-center justify-center mb-6 text-purple-600 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                            <Upload size={40} />
                        </div>
                        <h2 className="text-2xl font-bold text-slate-900 mb-2">Upload QR</h2>
                        <p className="text-center text-slate-500 max-w-[240px]">
                            Upload a QR code image from your library for processing.
                        </p>
                        <div className="mt-8 flex items-center text-purple-600 font-semibold text-sm">
                            Upload Image
                            <svg className="ml-2 w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                            </svg>
                        </div>
                        <input
                            type="file"
                            className="absolute inset-0 opacity-0 cursor-pointer"
                            accept="image/*"
                            onChange={handleImageUpload}
                        />
                    </div>
                </div>

                {/* Your Assets Section */}
                <div className="mt-16">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center">
                                <LayoutDashboard size={24} />
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-slate-900">Your Applications</h2>
                                <p className="text-slate-500 text-sm">View your provisioned assets and devices.</p>
                            </div>
                        </div>
                        {limits && (
                            <div className="flex gap-4">
                                <div className="bg-white border rounded-xl px-4 py-2 shadow-sm text-sm">
                                    <span className="text-slate-500 block text-[10px] uppercase font-bold tracking-wider">App Limit</span>
                                    <span className="font-bold text-slate-800">{applications.length}</span>
                                    <span className="text-slate-400 font-medium"> / {limits.app_limit}</span>
                                </div>
                                <div className="bg-white border rounded-xl px-4 py-2 shadow-sm text-sm">
                                    <span className="text-slate-500 block text-[10px] uppercase font-bold tracking-wider">Device Limit</span>
                                    <span className="font-bold text-slate-800">{devices.length}</span>
                                    <span className="text-slate-400 font-medium"> / {limits.device_limit}</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {isLoadingAssets ? (
                        <div className="flex items-center justify-center p-12 text-slate-400">
                            <Loader2 size={32} className="animate-spin" />
                        </div>
                    ) : applications.length === 0 ? (
                        <div className="p-12 text-center bg-white border border-slate-100 rounded-3xl text-slate-500 shadow-sm">
                            <p>No applications found for your account.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-6">
                            {applications.map(app => {
                                const appDevs = devices.filter(d => d.application_id === app._id);
                                return (
                                    <div key={app._id} className="bg-white border-2 border-slate-100 rounded-3xl p-6 shadow-sm hover:border-indigo-100 transition-colors">
                                        <div className="flex items-center justify-between mb-6">
                                            <div>
                                                <h3 className="text-xl font-bold text-slate-900">{app.name}</h3>
                                                {app.description && <p className="text-sm text-slate-500 mt-1">{app.description}</p>}
                                            </div>
                                            <div className="bg-indigo-50 px-3 py-1 rounded-full text-indigo-600 font-bold text-xs uppercase tracking-widest">
                                                {appDevs.length} Device{appDevs.length !== 1 ? 's' : ''}
                                            </div>
                                        </div>

                                        {appDevs.length > 0 ? (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                                {appDevs.map(dev => (
                                                    <div key={dev._id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100/60">
                                                        <div className="flex items-center justify-between mb-2">
                                                            <h4 className="font-bold text-slate-800 text-sm truncate">{dev.name}</h4>
                                                            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">{dev.status || 'PROVISIONED'}</span>
                                                        </div>
                                                        <div className="text-[10px] text-slate-500 space-y-1">
                                                            <p><span className="font-semibold text-slate-400 mr-1">SN:</span>{dev.device_id_string || 'N/A'}</p>
                                                            <p><span className="font-semibold text-slate-400 mr-1">Ver:</span>{dev.version || 'v1.0'}</p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="p-4 text-xs text-slate-400 italic text-center bg-slate-50/50 rounded-2xl border border-slate-100">
                                                No devices enrolled in this application.
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* QR Scanner Modal */}
                {isScanning && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
                        <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg overflow-hidden relative">
                            <button
                                onClick={() => setIsScanning(false)}
                                className="absolute top-6 right-6 z-10 p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full transition-colors"
                            >
                                <X size={20} />
                            </button>

                            <div className="p-8 pb-4 text-center">
                                <h3 className="text-2xl font-bold text-slate-900 mb-2">Scan Device QR</h3>
                                <p className="text-slate-500 text-sm">Position the QR code within the frame to authenticate.</p>
                            </div>

                            <div className="p-8 pt-0">
                                <div className="overflow-hidden rounded-3xl border-4 border-slate-50 relative min-h-[300px] bg-slate-50 flex flex-col items-center justify-center">
                                    {cameraError ? (
                                        <div className="p-8 text-center animate-in fade-in zoom-in-95">
                                            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                                <X size={32} />
                                            </div>
                                            <p className="text-slate-900 font-bold mb-2">Camera Error</p>
                                            <p className="text-slate-500 text-sm mb-6 leading-relaxed">
                                                {cameraError}
                                            </p>
                                            <button
                                                onClick={() => {
                                                    setIsScanning(false);
                                                    setTimeout(() => setIsScanning(true), 100);
                                                }}
                                                className="px-6 py-2 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-slate-800 transition-colors"
                                            >
                                                Retry Camera
                                            </button>
                                        </div>
                                    ) : (
                                        <div id="qr-reader" className="w-full h-full"></div>
                                    )}
                                </div>
                            </div>

                            {!cameraError && (
                                <div className="bg-slate-50 p-6 flex items-center justify-center space-x-3 text-slate-400">
                                    <Loader2 size={16} className="animate-spin" />
                                    <span className="text-xs font-bold uppercase tracking-widest">Awaiting detection...</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Modal logic ends here */}
            </main>

            {/* Hidden reader for file scanning */}
            <div id="reader-hidden" style={{ display: 'none' }}></div>

            {/* Footer */}
            <footer className="py-8 text-center text-slate-400 text-sm">
                &copy; {new Date().getFullYear()} ConQue Fleet Management. All rights reserved.
            </footer>
        </div>
    );
};

export default DashboardPage;
