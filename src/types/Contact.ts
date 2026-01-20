export interface Channel {
	id: string;
	type: string;
	identifier: string;
	label?: string | null;
	isPrimary: boolean;
	// Address fields (only for address-type channels)
	street1?: string | null;
	street2?: string | null;
	city?: string | null;
	state?: string | null;
	zip?: string | null;
	country?: string | null;
}

export interface ChannelType {
	id: string;
	name: string;
	description?: string | null;
	sortOrder: number;
}

export interface Tag {
	id: string;
	name: string;
}

export interface CustomFieldDefinition {
	id: string;
	name: string;
	description?: string | null;
	sortOrder: number;
}

export interface CustomFieldValue {
	id: string;
	value: string;
	fieldId: string;
	field?: CustomFieldDefinition;
}

export interface Contact {
	id: string;
	firstName: string;
	lastName?: string | null;
	birthday?: string | null;
	notes?: string | null;
	outreachFrequencyDays?: number | null;
	preferredContactMethod?: string | null;
	lastContacted?: string | null;
	createdAt: string;
	updatedAt: string;
	channels: Channel[];
	tags: Array<{ tag: Tag }>;
	customFields: CustomFieldValue[];
}

export interface ContactFormData {
	firstName: string;
	lastName?: string;
	birthday?: string;
	notes?: string;
	outreachFrequencyDays?: number | null;
	preferredContactMethod?: string;
	channels: Omit<Channel, 'id'>[];
	tagIds: string[];
	customFields: Array<{ fieldId: string; value: string }>;
}
