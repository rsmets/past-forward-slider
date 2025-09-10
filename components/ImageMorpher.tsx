/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useMemo } from 'react';
import type { GeneratedImage } from '../App';

interface ImageMorpherProps {
    images: Record<string, GeneratedImage>;
    labels: string[];
    sliderValue: number;
    onSliderChange: (value: number) => void;
}

const ImageMorpher: React.FC<ImageMorpherProps> = ({ images, labels, sliderValue, onSliderChange }) => {
    
    const successfulImages = useMemo(() => {
        return labels
            .map(label => ({
                label,
                url: images[label]?.url,
                status: images[label]?.status,
            }))
            .filter(image => image.status === 'done' && image.url);
    }, [images, labels]);

    const calculateOpacity = (index: number, currentValue: number): number => {
        const distance = Math.abs(currentValue - index);
        if (distance > 1) {
            return 0; // Not visible if it's not one of the two active images
        }
        // Creates a linear fade between the two images
        return 1 - distance;
    };

    if (successfulImages.length === 0) {
        return (
            <div className="w-full max-w-lg text-center p-8 bg-neutral-800/50 rounded-lg">
                <p className="font-permanent-marker text-xl text-red-400">
                    Sorry, no images could be generated.
                </p>
                <p className="text-neutral-400 mt-2">
                    There might have been an issue with the AI model or your photo. Please try again.
                </p>
            </div>
        );
    }

    return (
        <div className="w-full max-w-2xl flex flex-col items-center gap-6 animate-fade-in">
            {/* Image container */}
            <div className="relative w-full aspect-square bg-neutral-900 rounded-lg shadow-2xl overflow-hidden">
                {successfulImages.map((image, index) => (
                    <img
                        key={image.label}
                        src={image.url!}
                        alt={`Generated image for ${image.label}`}
                        className="absolute inset-0 w-full h-full object-cover select-none transition-opacity duration-75"
                        style={{ opacity: calculateOpacity(index, sliderValue) }}
                        aria-hidden={calculateOpacity(index, sliderValue) === 0}
                        draggable="false"
                    />
                ))}
            </div>
            
            {/* Slider controls */}
            <div className="w-full px-2">
                <input
                    type="range"
                    min="0"
                    max={successfulImages.length > 1 ? successfulImages.length - 1 : 1}
                    step="0.01"
                    value={sliderValue}
                    onChange={(e) => onSliderChange(parseFloat(e.target.value))}
                    className="w-full"
                    aria-label="Time period slider"
                />
                {/* Decade labels */}
                <div className="flex justify-between mt-2 text-xs text-neutral-400 font-permanent-marker">
                    {successfulImages.map(({ label }) => (
                        <span key={label}>{label.replace(' years', 'y')}</span>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default ImageMorpher;