export default function SizeSelector({ 
  variants, 
  selectedSize, 
  onSelectSize 
}: { 
  variants: any[]; 
  selectedSize: string | null; 
  onSelectSize: (size: string) => void;
}) {
  if (!variants || variants.length === 0) return null;

  const selectedVariant = variants.find((v: any) => v.sizeLabel === selectedSize);

  return (
    <div className="animate-fade-in-up" style={{ animationDelay: '200ms' }}>
      <h3 className="text-sm font-semibold text-forest-950 mb-4">Select Size</h3>
      
      {/* Size Buttons */}
      <div className="flex flex-wrap gap-3 mb-6">
        {variants.map((variant: any) => {
          const isOutOfStock = variant.stock === 0;
          return (
            <button
              key={variant.id}
              onClick={() => !isOutOfStock && onSelectSize(variant.sizeLabel)}
              disabled={isOutOfStock}
              className={`
                relative min-w-[52px] px-4 py-3 rounded-xl text-sm font-medium border-2 transition-all duration-300
                ${isOutOfStock 
                  ? "border-forest-100 bg-gray-50 text-gray-400 cursor-not-allowed"
                  : selectedSize === variant.sizeLabel
                    ? "border-forest-900 bg-forest-900 text-white shadow-soft"
                    : "border-forest-200 text-forest-700 hover:border-forest-400 hover:bg-forest-50"
                }
              `}
            >
              {variant.sizeLabel}
              {isOutOfStock && (
                <span className="absolute top-1/2 left-2 right-2 h-[1.5px] bg-gray-300 -translate-y-1/2 rotate-[-15deg]"></span>
              )}
            </button>
          );
        })}
      </div>

      {/* Measurements Card */}
      {selectedVariant && (
        <div className="bg-cream-50 rounded-2xl p-5 border border-forest-100 transition-all duration-500">
          <h4 className="text-xs font-bold text-forest-700/50 uppercase tracking-widest mb-3">Size Measurements</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {selectedVariant.chestCm && (
              <div>
                <span className="text-[11px] text-forest-500 uppercase tracking-wider">Chest</span>
                <p className="text-sm font-semibold text-forest-950">{selectedVariant.chestCm} cm</p>
              </div>
            )}
            {selectedVariant.waistCm && (
              <div>
                <span className="text-[11px] text-forest-500 uppercase tracking-wider">Waist</span>
                <p className="text-sm font-semibold text-forest-950">{selectedVariant.waistCm} cm</p>
              </div>
            )}
            {selectedVariant.hipCm && (
              <div>
                <span className="text-[11px] text-forest-500 uppercase tracking-wider">Hip</span>
                <p className="text-sm font-semibold text-forest-950">{selectedVariant.hipCm} cm</p>
              </div>
            )}
            {selectedVariant.lengthCm && (
              <div>
                <span className="text-[11px] text-forest-500 uppercase tracking-wider">Length</span>
                <p className="text-sm font-semibold text-forest-950">{selectedVariant.lengthCm} cm</p>
              </div>
            )}
            {selectedVariant.inseamCm && (
              <div>
                <span className="text-[11px] text-forest-500 uppercase tracking-wider">Inseam</span>
                <p className="text-sm font-semibold text-forest-950">{selectedVariant.inseamCm} cm</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
