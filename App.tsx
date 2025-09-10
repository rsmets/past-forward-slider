/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { transformImageForTimePeriod } from './services/geminiService';
import PolaroidCard from './components/PolaroidCard';
import ImageMorpher from './components/ImageMorpher';

const TIME_SHIFTS = [-75, -50, -25, 25, 50, 75];
const TIME_LABELS = TIME_SHIFTS.map(shift => shift < 0 ? `${shift} years` : `+${shift} years`);

// Pre-defined positions for a scattered look on desktop
const POSITIONS = [
    { top: '5%', left: '10%', rotate: -8 },
    { top: '15%', left: '60%', rotate: 5 },
    { top: '45%', left: '5%', rotate: 3 },
    { top: '2%', left: '35%', rotate: 10 },
    { top: '40%', left: '70%', rotate: -12 },
    { top: '50%', left: '38%', rotate: -3 },
];

const getTransformPrompt = (shift: number) => `You are an expert in historical and futuristic photography styles. Using the provided image, which is from the present day, transform it to look like it was taken ${Math.abs(shift)} years in the ${shift < 0 ? 'past' : 'future'}. The entire image, including people, background, objects, fashion, and photographic style (color, grain, quality, aspect ratio) should be modified to convincingly represent that era. Do not add any text or overlays to the image. Ensure the output is a photorealistic image and maintains the core composition of the original.`;

type ImageStatus = 'pending' | 'done' | 'error';
export interface GeneratedImage {
    status: ImageStatus;
    url?: string;
    error?: string;
}

const primaryButtonClasses = "font-permanent-marker text-xl text-center text-black bg-yellow-400 py-3 px-8 rounded-sm transform transition-transform duration-200 hover:scale-105 hover:-rotate-2 hover:bg-yellow-300 shadow-[2px_2px_0px_2px_rgba(0,0,0,0.2)] disabled:opacity-50 disabled:cursor-not-allowed";
const secondaryButtonClasses = "font-permanent-marker text-xl text-center text-white bg-white/10 backdrop-blur-sm border-2 border-white/80 py-3 px-8 rounded-sm transform transition-transform duration-200 hover:scale-105 hover:rotate-2 hover:bg-white hover:text-black";

const useMediaQuery = (query: string) => {
    const [matches, setMatches] = useState(false);
    useEffect(() => {
        const media = window.matchMedia(query);
        if (media.matches !== matches) {
            setMatches(media.matches);
        }
        const listener = () => setMatches(media.matches);
        window.addEventListener('resize', listener);
        return () => window.removeEventListener('resize', listener);
    }, [matches, query]);
    return matches;
};

// Helper to resize image before uploading
const resizeImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_DIMENSION = 1024;
                let { width, height } = img;
                if (width > height) {
                    if (width > MAX_DIMENSION) {
                        height *= MAX_DIMENSION / width;
                        width = MAX_DIMENSION;
                    }
                } else {
                    if (height > MAX_DIMENSION) {
                        width *= MAX_DIMENSION / height;
                        height = MAX_DIMENSION;
                    }
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) return reject(new Error('Could not get canvas context'));
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.9));
            };
            img.onerror = reject;
            img.src = event.target?.result as string;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
};


function App() {
    const [sourceImage, setSourceImage] = useState<string | null>(null);
    const [generatedImages, setGeneratedImages] = useState<Record<string, GeneratedImage>>({});
    const [sliderValue, setSliderValue] = useState<number>(2); // Start slider on "-25 years"
    const [appState, setAppState] = useState<'select-image' | 'confirm-image' | 'generating' | 'results-shown'>('select-image');
    const [isCameraOpen, setIsCameraOpen] = useState(false);

    const dragAreaRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    
    const isMobile = useMediaQuery('(max-width: 768px)');
    
    const stopCameraStream = useCallback(() => {
        if (videoRef.current && videoRef.current.srcObject) {
            const stream = videoRef.current.srcObject as MediaStream;
            stream.getTracks().forEach(track => track.stop());
            videoRef.current.srcObject = null;
        }
    }, []);

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            try {
                const resizedDataUrl = await resizeImage(file);
                setSourceImage(resizedDataUrl);
                setAppState('confirm-image');
            } catch (error) {
                console.error("Error resizing image:", error);
                alert("Could not process the selected image. Please try another one.");
            }
        }
    };

    const handleTakePhotoClick = async () => {
        setIsCameraOpen(true);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }
        } catch (error) {
            console.error("Error accessing camera:", error);
            alert("Could not access the camera. Please ensure permissions are granted.");
            setIsCameraOpen(false);
        }
    };

    const handleCapture = () => {
        if (videoRef.current) {
            const canvas = document.createElement('canvas');
            canvas.width = videoRef.current.videoWidth;
            canvas.height = videoRef.current.videoHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg');
            setSourceImage(dataUrl);
            setAppState('confirm-image');
            stopCameraStream();
            setIsCameraOpen(false);
        }
    };
    
    const handleGenerateClick = async () => {
        if (!sourceImage) return;

        setAppState('generating');
        
        const initialImages: Record<string, GeneratedImage> = {};
        TIME_LABELS.forEach(label => {
            initialImages[label] = { status: 'pending' };
        });
        setGeneratedImages(initialImages);

        const generationPromises = TIME_SHIFTS.map((shift, index) => {
            const label = TIME_LABELS[index];
            const prompt = getTransformPrompt(shift);
            
            return transformImageForTimePeriod(sourceImage, prompt)
                .then(newImageUrl => {
                    setGeneratedImages(prev => ({
                        ...prev,
                        [label]: { status: 'done', url: newImageUrl },
                    }));
                })
                .catch(err => {
                    console.error(`Failed to generate image for ${label}:`, err);
                    const errorMessage = err instanceof Error ? err.message : 'Generation failed.';
                    setGeneratedImages(prev => ({
                        ...prev,
                        [label]: { status: 'error', error: errorMessage },
                    }));
                });
        });

        await Promise.allSettled(generationPromises);
        
        setAppState('results-shown');
    };
    
    const handleReset = () => {
        setSourceImage(null);
        setGeneratedImages({});
        setAppState('select-image');
        setSliderValue(2);
    };

    const handleDownloadCurrentImage = () => {
        const successfulImages = TIME_LABELS
            .map(label => ({ label, ...generatedImages[label] }))
            .filter(img => img.status === 'done' && img.url);

        if (successfulImages.length === 0) return;

        const closestIndex = Math.round(sliderValue);
        const imageToDownload = successfulImages[closestIndex];
        
        if (imageToDownload && imageToDownload.url) {
            const link = document.createElement('a');
            link.href = imageToDownload.url;
            link.download = `past-forward-${imageToDownload.label.replace(' ', '')}.jpg`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };

    useEffect(() => {
        // Cleanup camera stream on component unmount
        return () => stopCameraStream();
    }, [stopCameraStream]);

    return (
        <main className="bg-black text-neutral-200 min-h-screen w-full flex flex-col items-center justify-center p-4 overflow-hidden relative">
            <div className="absolute top-0 left-0 w-full h-full bg-grid-white/[0.05]"></div>
            
            <div className="z-10 flex flex-col items-center justify-center w-full h-full flex-1 min-h-0">
                <div className="text-center mb-10">
                    <h1 className="text-6xl md:text-8xl font-caveat font-bold text-neutral-100">Past Forward</h1>
                    <p className="font-permanent-marker text-neutral-300 mt-2 text-xl tracking-wide">Travel through time with your photos.</p>
                </div>

                {appState === 'select-image' && (
                     <div className="relative flex flex-col items-center justify-center w-full">
                        <motion.div
                             initial={{ opacity: 0, y: 20 }}
                             animate={{ opacity: 1, y: 0 }}
                             transition={{ delay: 0.2, duration: 0.8 }}
                             className="flex flex-col sm:flex-row items-center gap-4"
                        >
                             <button onClick={handleTakePhotoClick} className={primaryButtonClasses}>
                                Take Photo
                             </button>
                             <button onClick={() => fileInputRef.current?.click()} className={secondaryButtonClasses}>
                                Upload Photo
                             </button>
                             <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
                        </motion.div>
                    </div>
                )}
                
                {appState === 'confirm-image' && sourceImage && (
                    <div className="relative flex flex-col items-center justify-center w-full">
                        <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }}>
                            <PolaroidCard caption="Your Photo" status="done" imageUrl={sourceImage} />
                        </motion.div>
                         <motion.div
                             initial={{ opacity: 0, y: 20 }}
                             animate={{ opacity: 1, y: 0 }}
                             transition={{ delay: 0.5, duration: 0.8 }}
                             className="flex flex-col sm:flex-row items-center gap-4 mt-8"
                        >
                             <button onClick={handleGenerateClick} className={primaryButtonClasses}>
                                Generate
                             </button>
                             <button onClick={handleReset} className={secondaryButtonClasses}>
                                Back
                             </button>
                        </motion.div>
                    </div>
                )}


                {appState === 'generating' && (
                     <>
                        {isMobile ? (
                            <div className="w-full max-w-sm flex-1 overflow-y-auto mt-4 space-y-8 p-4">
                                {TIME_LABELS.map((label) => (
                                    <div key={label} className="flex justify-center">
                                         <PolaroidCard
                                            caption={label}
                                            status={generatedImages[label]?.status || 'pending'}
                                            imageUrl={generatedImages[label]?.url}
                                            error={generatedImages[label]?.error}
                                            isMobile={isMobile}
                                        />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div ref={dragAreaRef} className="relative w-full max-w-5xl h-[600px] mt-4">
                                {TIME_LABELS.map((label, index) => {
                                    const { top, left, rotate } = POSITIONS[index];
                                    return (
                                        <motion.div
                                            key={label}
                                            className="absolute cursor-grab active:cursor-grabbing"
                                            style={{ top, left }}
                                            initial={{ opacity: 0, scale: 0.5, y: 100, rotate: 0 }}
                                            animate={{ 
                                                opacity: 1, 
                                                scale: 1, 
                                                y: 0,
                                                rotate: `${rotate}deg`,
                                            }}
                                            transition={{ type: 'spring', stiffness: 100, damping: 20, delay: index * 0.15 }}
                                        >
                                            <PolaroidCard 
                                                dragConstraintsRef={dragAreaRef}
                                                caption={label}
                                                status={generatedImages[label]?.status || 'pending'}
                                                imageUrl={generatedImages[label]?.url}
                                                error={generatedImages[label]?.error}
                                                isMobile={isMobile}
                                            />
                                        </motion.div>
                                    );
                                })}
                            </div>
                        )}
                         <div className="h-20 mt-4 flex items-center justify-center">
                            <p className="font-permanent-marker text-xl text-yellow-400 animate-pulse">
                                Generating your journey through time...
                            </p>
                        </div>
                    </>
                )}

                {appState === 'results-shown' && (
                    <>
                        <ImageMorpher 
                            images={generatedImages}
                            labels={TIME_LABELS}
                            sliderValue={sliderValue}
                            onSliderChange={setSliderValue}
                        />
                        <div className="h-20 mt-8 flex items-center justify-center">
                            <div className="flex flex-col sm:flex-row items-center gap-4">
                                <button 
                                    onClick={handleDownloadCurrentImage} 
                                    className={primaryButtonClasses}
                                >
                                    Download Image
                                </button>
                                <button onClick={handleReset} className={secondaryButtonClasses}>
                                    Start Over
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>

            <AnimatePresence>
                {isCameraOpen && (
                     <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/90 z-50 flex flex-col items-center justify-center"
                    >
                        <video ref={videoRef} autoPlay playsInline className="w-full max-w-lg h-auto rounded-md"></video>
                        <div className="flex items-center gap-4 mt-6">
                             <button onClick={handleCapture} className={primaryButtonClasses}>Capture</button>
                             <button onClick={() => { stopCameraStream(); setIsCameraOpen(false); }} className={secondaryButtonClasses}>Cancel</button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </main>
    );
}

export default App;