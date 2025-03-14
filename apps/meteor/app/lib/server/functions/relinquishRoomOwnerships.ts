import { Messages, Roles } from '@rocket.chat/models';

import { FileUpload } from '../../../file-upload/server';
import { Subscriptions, Rooms } from '../../../models/server';
import type { SubscribedRoomsForUserWithDetails } from './getRoomsWithSingleOwner';

const bulkRoomCleanUp = async (rids: string[]): Promise<unknown> => {
	// no bulk deletion for files
	rids.forEach((rid) => FileUpload.removeFilesByRoomId(rid));

	return Promise.all([Subscriptions.removeByRoomIds(rids), Messages.removeByRoomIds(rids), Rooms.removeByIds(rids)]);
};

export const relinquishRoomOwnerships = async function (
	userId: string,
	subscribedRooms: SubscribedRoomsForUserWithDetails[],
	removeDirectMessages = true,
): Promise<SubscribedRoomsForUserWithDetails[]> {
	// change owners
	const changeOwner = subscribedRooms.filter(({ shouldChangeOwner }) => shouldChangeOwner);

	for await (const { newOwner, rid } of changeOwner) {
		newOwner && (await Roles.addUserRoles(newOwner, ['owner'], rid));
	}

	const roomIdsToRemove: string[] = subscribedRooms.filter(({ shouldBeRemoved }) => shouldBeRemoved).map(({ rid }) => rid);

	if (removeDirectMessages) {
		Rooms.find1On1ByUserId(userId, { fields: { _id: 1 } }).forEach(({ _id }: { _id: string }) => roomIdsToRemove.push(_id));
	}

	await bulkRoomCleanUp(roomIdsToRemove);

	return subscribedRooms;
};
