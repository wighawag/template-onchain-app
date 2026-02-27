import type {Abi, AbiFunction, AbiParameter, AbiStateMutability} from 'viem';

export type {AbiFunction};

/**
 * Generate a unique key for an input parameter (by name or by index)
 */
export function getInputKey(input: AbiParameter, index: number): string {
	return input.name || `arg${index}`;
}

/**
 * Generate a display label for an input parameter
 */
export function getInputLabel(input: AbiParameter, index: number): string {
	return input.name || `Argument ${index}`;
}

/**
 * Extract only functions from ABI, filtering out events, errors, constructors, fallbacks, and receives
 */
export function getContractFunctions(abi: Abi): AbiFunction[] {
	return abi.filter((item): item is AbiFunction => {
		return (
			item.type === 'function' &&
			item.name !== undefined
		);
	});
}

/**
 * Determine if function is view/pure
 */
export function isViewFunction(stateMutability: AbiStateMutability): boolean {
	return stateMutability === 'view' || stateMutability === 'pure';
}

/**
 * Format function signature for display
 */
export function formatFunctionSignature(abiItem: AbiFunction): string {
	const params = abiItem.inputs.map((input) => `${input.internalType || input.type} ${input.name}`).join(', ');
	const outputs = abiItem.outputs.map((output) => `${output.internalType || output.type}`).join(', ');
	
	return `${outputs ? `${outputs} ` : ''}${abiItem.name}(${params})`;
}

/**
 * Convert input values from UI to contract format
 */
export function convertInputValues(inputs: readonly AbiParameter[], values: Record<string, any>): any[] {
	return inputs.map((input, index) => {
		const key = getInputKey(input, index);
		const value = values[key];
		
		if (value === undefined || value === '') {
			return undefined;
		}
		
		switch (input.type) {
			case 'address':
				return value as `0x${string}`;
			case 'uint256':
			case 'uint128':
			case 'uint64':
			case 'uint32':
			case 'uint16':
			case 'uint8':
				return BigInt(value);
			case 'int256':
			case 'int128':
			case 'int64':
			case 'int32':
			case 'int16':
			case 'int8':
				return BigInt(value);
			case 'bool':
				return value === 'true' || value === true;
			case 'string':
				return String(value);
			case 'bytes':
			case 'bytes32':
			case 'bytes16':
			case 'bytes8':
			case 'bytes4':
			case 'bytes2':
			case 'bytes1':
				return value as `0x${string}`;
			default:
				// Handle arrays (e.g., uint256[])
				if (input.type.match(/^\w+\[\]$/)) {
					return String(value).split(',').map(v => v.trim());
				}
				// Handle fixed arrays (e.g., uint256[3])
				if (input.type.match(/^\w+\[\d+\]$/)) {
					return String(value).split(',').map(v => v.trim());
				}
				// Handle tuples - return as is for now
				if (input.type === 'tuple' || input.type === 'tuple[]') {
					return value;
				}
				return value;
		}
	});
}

/**
 * Format output as pretty JSON
 */
export function formatOutputJSON(output: any): string {
	if (output === undefined || output === null) {
		return 'null';
	}
	try {
		return JSON.stringify(output, null, 2);
	} catch {
		return String(output);
	}
}

/**
 * Validate address format
 */
export function isValidAddress(address: string): boolean {
	return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Validate hex format
 */
export function isValidHex(hex: string): boolean {
	return /^0x[a-fA-F0-9]*$/.test(hex);
}

/**
 * Validate numeric input
 */
export function isValidNumber(value: string): boolean {
	return /^-?\d+$/.test(value);
}

/**
 * Get input field type based on Solidity type
 */
export function getInputFieldType(abiType: string): 'text' | 'number' | 'select' {
	if (abiType === 'bool') {
		return 'select';
	}
	if (abiType.startsWith('uint') || abiType.startsWith('int')) {
		return 'number';
	}
	return 'text';
}

/**
 * Get input placeholder based on Solidity type
 */
export function getInputPlaceholder(abiType: string): string {
	switch (abiType) {
		case 'address':
			return '0x...';
		case 'string':
			return 'Enter text...';
		case 'bool':
			return 'Select true/false';
		default:
			if (abiType.startsWith('uint') || abiType.startsWith('int')) {
				return 'Enter number...';
			}
			if (abiType.startsWith('bytes')) {
				return '0x...';
			}
			if (abiType.includes('[]')) {
				return 'Enter comma-separated values...';
			}
			return 'Enter value...';
	}
}

/**
 * Validate input value based on Solidity type
 */
export function validateInputValue(abiType: string, value: string): {valid: boolean; error?: string} {
	if (!value) {
		return {valid: true}; // Empty is OK for optional params
	}
	
	switch (abiType) {
		case 'address':
			if (!isValidAddress(value)) {
				return {valid: false, error: 'Invalid address format (must be 0x...)'};
			}
			break;
		case 'bool':
			if (value !== 'true' && value !== 'false') {
				return {valid: false, error: 'Must be true or false'};
			}
			break;
		default:
			if (abiType.startsWith('uint') || abiType.startsWith('int')) {
				if (!isValidNumber(value)) {
					return {valid: false, error: 'Invalid number format'};
				}
			}
			if (abiType.startsWith('bytes')) {
				if (!isValidHex(value)) {
					return {valid: false, error: 'Invalid hex format (must start with 0x...)'};
				}
			}
			break;
	}
	
	return {valid: true};
}